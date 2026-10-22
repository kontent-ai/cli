import { describe, expect, it, vi } from "vitest";
// biome-ignore lint/correctness/useImportExtensions: JSON imports must keep the .json extension
import pkg from "../../package.json" with { type: "json" };
import { createRawMapi, type RawRequest } from "../../src/cli/adapters/mapi/raw/client.js";
import { createLogger } from "../../src/cli/log.js";
import { assertErr, assertOk } from "../helpers/assertResult.js";
import { type HttpRoute, httpTestAdapter } from "../helpers/httpTestAdapter.js";

const ENV_ID = "11111111-2222-3333-4444-555555555555";
const BASE_URL = "https://manage.test/v2";
// Mirrors the cap the client configures on core-sdk's retry strategy.
const MAX_RETRY_DELAY_MS = 60_000;

const logger = createLogger("none");

const makeRequest = (overrides: Partial<RawRequest> = {}): RawRequest => ({
  url: new URL(`${BASE_URL}/projects/${ENV_ID}/types`),
  method: "GET",
  headers: [],
  body: null,
  ...overrides,
});

type RunOptions = Readonly<{
  request?: Partial<RawRequest>;
  token?: string | undefined;
}>;

const run = async (routes: ReadonlyArray<HttpRoute>, options: RunOptions = {}) => {
  const { adapter, requests } = httpTestAdapter(routes);
  const mapi = createRawMapi({ adapter, logger });
  // `token: undefined` means an explicitly tokenless request, distinct from omitting it.
  const token = "token" in options ? options.token : "secret-token";
  const result = await mapi.send(makeRequest(options.request), token);
  return { result, requests };
};

const typesRoute: HttpRoute = {
  method: "GET",
  path: /\/types$/,
  replies: [{ payload: { types: [] } }],
};

describe("createRawMapi", () => {
  it("sends an authenticated GET with the SDK id", async () => {
    const { result, requests } = await run([typesRoute]);

    assertOk(result);
    expect(result.value.status).toBe(200);
    expect(result.value.statusText).toBe("OK");
    expect(result.value.payload).toEqual({ types: [] });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url.toString()).toBe(`${BASE_URL}/projects/${ENV_ID}/types`);
    expect(requests[0]?.requestHeaders).toContainEqual({
      name: "Authorization",
      value: "Bearer secret-token",
    });
    expect(requests[0]?.requestHeaders).toContainEqual({
      name: "X-KC-SDKID",
      value: `npmjs.com;${pkg.name};${pkg.version}`,
    });
  });

  it("sends one header per name, the last occurrence winning", async () => {
    const { requests } = await run([typesRoute], {
      request: {
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

  it("sends a caller-supplied Authorization header as the only one", async () => {
    const { requests } = await run([typesRoute], {
      token: undefined,
      request: { headers: [{ name: "Authorization", value: "Bearer caller-token" }] },
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
        request: {
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
    expect(result.value.status).toBe(404);
    expect(result.value.payload).toEqual({
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
    expect(result.value.status).toBe(200);
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
    expect(result.value.status).toBe(429);
  });

  it("clamps a Retry-After that asks for longer than the retry limit", async () => {
    vi.useFakeTimers();
    try {
      const { adapter, requests } = httpTestAdapter([
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
      const pending = createRawMapi({ adapter, logger }).send(makeRequest(), "secret-token");

      // The API asked for an hour; the wait ends at the cap, not at what it asked for.
      await vi.advanceTimersByTimeAsync(MAX_RETRY_DELAY_MS - 1);
      expect(requests).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(1);

      const result = await pending;
      expect(requests).toHaveLength(2);
      assertOk(result);
      expect(result.value.status).toBe(200);
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
      { request: { abortSignal: controller.signal } },
    );
    setTimeout(() => controller.abort(), 20);

    const { result, requests } = await pending;

    expect(requests).toHaveLength(1);
    assertErr(result);
    expect(result.error).toBe("The request was aborted.");
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
      { request: { method: "POST", body: new Blob(["{}"]) } },
    );

    expect(requests).toHaveLength(1);
    assertOk(result);
    expect(result.value.status).toBe(503);
  });

  it("reports a failed request as a transport error", async () => {
    const { result } = await run([
      {
        method: "GET",
        path: /\/types$/,
        replies: [{ throws: new Error("socket hang up") }],
      },
    ]);

    expect(result).toEqual({ kind: "err", error: "socket hang up" });
  });
});
