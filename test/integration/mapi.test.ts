import { describe, expect, it, vi } from "vitest";
import { type MapiRequestParams, performRawMapiRequest } from "../../src/core/mapi/request.js";
import { createMapiRawClient } from "../../src/lib/mapi/raw/client.js";
import { createLogger } from "../../src/log.js";
import { assertErr, assertOk } from "../helpers/assertResult.js";
import { type MapiRoute, mapiTestAdapter } from "../helpers/mapiTestAdapter.js";

const ENV_ID = "11111111-2222-3333-4444-555555555555";
const BASE_URL = "https://manage.test/v2";
// Mirrors the cap the client configures on core-sdk's retry strategy.
const MAX_RETRY_DELAY_MS = 60_000;

const logger = createLogger("none");

const makeParams = (overrides: Partial<MapiRequestParams> = {}): MapiRequestParams => ({
  endpoint: "types",
  envId: ENV_ID,
  method: "GET",
  headers: [],
  body: null,
  ...overrides,
});

type RunOptions = Readonly<{
  params?: Partial<MapiRequestParams>;
  token?: string | undefined;
}>;

const run = async (routes: ReadonlyArray<MapiRoute>, options: RunOptions = {}) => {
  const { adapter, requests } = mapiTestAdapter(routes);
  const client = createMapiRawClient({
    // `token: undefined` means an explicitly tokenless client, distinct from omitting it.
    token: "token" in options ? options.token : "secret-token",
    baseUrl: BASE_URL,
    adapter,
    logger,
  });
  const result = await performRawMapiRequest(makeParams(options.params), { logger, client });
  return { result, requests };
};

const typesRoute: MapiRoute = {
  method: "GET",
  path: /\/types$/,
  replies: [{ payload: { types: [] } }],
};

describe("performRawMapiRequest", () => {
  it("sends an authenticated GET to the environment-scoped endpoint", async () => {
    const { result, requests } = await run([typesRoute]);

    assertOk(result);
    expect(result.value.statusCode).toBe(200);
    expect(result.value.statusText).toBe("OK");
    expect(result.value.body).toEqual({ types: [] });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url.toString()).toBe(`${BASE_URL}/projects/${ENV_ID}/types`);
    expect(requests[0]?.requestHeaders).toContainEqual({
      name: "Authorization",
      value: "Bearer secret-token",
    });
    expect(requests[0]?.requestHeaders?.map((header) => header.name)).toContain("X-KC-SDKID");
  });

  it("sends one header per name, the last occurrence winning", async () => {
    const { requests } = await run([typesRoute], {
      params: {
        headers: [
          { name: "Content-Type", value: "application/json" },
          { name: "content-type", value: "text/plain" },
        ],
      },
    });

    const contentTypes = (requests[0]?.requestHeaders ?? []).filter(
      (header) => header.name.toLowerCase() === "content-type",
    );
    expect(contentTypes.map((header) => header.value)).toEqual(["text/plain"]);
  });

  it("adds no Authorization of its own when the client has no token", async () => {
    const { requests } = await run([typesRoute], {
      token: undefined,
      params: { headers: [{ name: "Authorization", value: "Bearer caller-token" }] },
    });

    const authorizations = (requests[0]?.requestHeaders ?? []).filter(
      (header) => header.name.toLowerCase() === "authorization",
    );
    expect(authorizations.map((header) => header.value)).toEqual(["Bearer caller-token"]);
  });

  it("passes the body through untouched", async () => {
    const { requests } = await run(
      [{ method: "POST", path: /\/types$/, replies: [{ status: 201 }] }],
      {
        params: {
          method: "POST",
          body: new Blob(['{"codename":"x"}']),
        },
      },
    );

    const sentBody = requests[0]?.body;
    expect(sentBody).toBeInstanceOf(Blob);
    await expect((sentBody as Blob).text()).resolves.toBe('{"codename":"x"}');
  });

  it("reports a 4xx as a successful transport with the API payload", async () => {
    const { result } = await run([
      {
        method: "GET",
        path: /\/types$/,
        replies: [
          {
            status: 404,
            statusText: "Not Found",
            payload: { message: "The requested content type was not found." },
          },
        ],
      },
    ]);

    assertOk(result);
    expect(result.value.statusCode).toBe(404);
    expect(result.value.body).toEqual({
      message: "The requested content type was not found.",
    });
  });

  it("retries a 429 honoring Retry-After and returns the next response", async () => {
    const { result, requests } = await run([
      {
        method: "GET",
        path: /\/types$/,
        replies: [
          {
            status: 429,
            statusText: "Too Many Requests",
            headers: [{ name: "Retry-After", value: "0" }],
          },
          { payload: { types: [] } },
        ],
      },
    ]);

    expect(requests).toHaveLength(2);
    assertOk(result);
    expect(result.value.statusCode).toBe(200);
  });

  it("gives up on a persistent 429 after the retry budget", async () => {
    const { result, requests } = await run([
      {
        method: "GET",
        path: /\/types$/,
        replies: [
          {
            status: 429,
            statusText: "Too Many Requests",
            headers: [{ name: "Retry-After", value: "0" }],
          },
        ],
      },
    ]);

    expect(requests).toHaveLength(4);
    assertOk(result);
    expect(result.value.statusCode).toBe(429);
  });

  it("clamps a Retry-After that asks for longer than the retry limit", async () => {
    vi.useFakeTimers();
    try {
      const { adapter, requests } = mapiTestAdapter([
        {
          method: "GET",
          path: /\/types$/,
          replies: [
            {
              status: 429,
              statusText: "Too Many Requests",
              headers: [{ name: "Retry-After", value: "3600" }],
            },
            { payload: { types: [] } },
          ],
        },
      ]);
      const client = createMapiRawClient({
        token: "secret-token",
        baseUrl: BASE_URL,
        adapter,
        logger,
      });
      const pending = performRawMapiRequest(makeParams(), { logger, client });

      // The API asked for an hour; the wait ends at the cap, not at what it asked for.
      await vi.advanceTimersByTimeAsync(MAX_RETRY_DELAY_MS - 1);
      expect(requests).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(1);

      const result = await pending;
      expect(requests).toHaveLength(2);
      assertOk(result);
      expect(result.value.statusCode).toBe(200);
    } finally {
      vi.useRealTimers();
    }
  });

  it("abandons the backoff when the request is aborted mid-wait", async () => {
    const controller = new AbortController();
    const pending = run(
      [
        {
          method: "GET",
          path: /\/types$/,
          replies: [
            {
              status: 429,
              statusText: "Too Many Requests",
              // Long enough that only the abort can end the wait.
              headers: [{ name: "Retry-After", value: "30" }],
            },
            { payload: { types: [] } },
          ],
        },
      ],
      { params: { abortSignal: controller.signal } },
    );
    setTimeout(() => controller.abort(), 20);

    const { result, requests } = await pending;

    expect(requests).toHaveLength(1);
    assertErr(result);
    expect(result.error).toEqual({ kind: "transport", message: "The request was aborted." });
  });

  it("does not retry a non-429 failure", async () => {
    // If retrying ever leaks past 429, the second reply answers 201 and both asserts fail.
    const { result, requests } = await run(
      [
        {
          method: "POST",
          path: /\/types$/,
          replies: [{ status: 503, statusText: "Service Unavailable" }, { status: 201 }],
        },
      ],
      { params: { method: "POST", body: new Blob(["{}"]) } },
    );

    expect(requests).toHaveLength(1);
    assertOk(result);
    expect(result.value.statusCode).toBe(503);
  });

  it("reports a failed request as a transport error", async () => {
    const { result } = await run([
      {
        method: "GET",
        path: /\/types$/,
        replies: [{ throws: new Error("socket hang up") }],
      },
    ]);

    expect(result).toEqual({
      kind: "err",
      error: { kind: "transport", message: "socket hang up" },
    });
  });

  it("rejects an absolute endpoint before any request is made", async () => {
    const { result, requests } = await run([typesRoute], {
      params: { endpoint: "https://evil.example.com/types" },
    });

    expect(requests).toHaveLength(0);
    assertErr(result);
    expect(result.error.kind).toBe("invalid-endpoint");
  });
});
