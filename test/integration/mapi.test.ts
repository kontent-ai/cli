import { describe, expect, it } from "vitest";
import { type MapiRequestParams, performMapiRequest } from "../../src/core/mapi/request.js";
import { createMapiRawClient } from "../../src/lib/mapi/raw/client.js";
import { createLogger } from "../../src/log.js";
import { type MapiRoute, mapiTestAdapter } from "../helpers/mapiTestAdapter.js";

const ENV_ID = "11111111-2222-3333-4444-555555555555";
const BASE_URL = "https://manage.test/v2";

const logger = createLogger("none");

const makeParams = (overrides: Partial<MapiRequestParams> = {}): MapiRequestParams => ({
  endpoint: "types",
  envId: ENV_ID,
  method: "GET",
  headers: [],
  body: null,
  ...overrides,
});

const run = async (routes: ReadonlyArray<MapiRoute>, overrides?: Partial<MapiRequestParams>) => {
  const { adapter, requests } = mapiTestAdapter(routes);
  const client = createMapiRawClient({ token: "secret-token", baseUrl: BASE_URL, adapter });
  const result = await performMapiRequest(makeParams(overrides), { logger, client });
  return { result, requests };
};

const typesRoute: MapiRoute = {
  method: "GET",
  path: /\/types$/,
  replies: [{ payload: { types: [] } }],
};

describe("performMapiRequest", () => {
  it("sends an authenticated GET to the environment-scoped endpoint", async () => {
    const { result, requests } = await run([typesRoute]);

    expect(result).toEqual({
      kind: "ok",
      value: { statusCode: 200, statusText: "OK", headers: [], payload: { types: [] } },
    });
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
      headers: [
        { name: "Content-Type", value: "application/json" },
        { name: "content-type", value: "text/plain" },
      ],
    });

    const contentTypes = (requests[0]?.requestHeaders ?? []).filter(
      (header) => header.name.toLowerCase() === "content-type",
    );
    expect(contentTypes).toEqual([{ name: "content-type", value: "text/plain" }]);
  });

  it("adds no Authorization of its own when the client has no token", async () => {
    const { adapter, requests } = mapiTestAdapter([typesRoute]);
    const client = createMapiRawClient({ baseUrl: BASE_URL, adapter });

    await performMapiRequest(
      makeParams({ headers: [{ name: "Authorization", value: "Bearer caller-token" }] }),
      { logger, client },
    );

    expect(requests[0]?.requestHeaders).toContainEqual({
      name: "Authorization",
      value: "Bearer caller-token",
    });
    expect(
      (requests[0]?.requestHeaders ?? []).filter(
        (header) => header.name.toLowerCase() === "authorization",
      ),
    ).toHaveLength(1);
  });

  it("passes the body through untouched", async () => {
    const { requests } = await run(
      [{ method: "POST", path: /\/types$/, replies: [{ status: 201 }] }],
      {
        method: "POST",
        body: '{"codename":"x"}',
      },
    );

    expect(requests[0]?.body).toBe('{"codename":"x"}');
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

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") {
      return;
    }
    expect(result.value.statusCode).toBe(404);
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
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") {
      return;
    }
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
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") {
      return;
    }
    expect(result.value.statusCode).toBe(429);
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
      endpoint: "https://evil.example.com/types",
    });

    expect(requests).toHaveLength(0);
    expect(result.kind).toBe("err");
    if (result.kind !== "err") {
      return;
    }
    expect(result.error.kind).toBe("invalid-endpoint");
  });
});
