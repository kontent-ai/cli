import { afterEach, describe, expect, it, vi } from "vitest";
import { createBoundedTransport } from "../../src/cli/adapters/telemetry/transport.js";

const SERVER_URL = "https://api2.amplitude.test/2/httpapi";
const PAYLOAD = { api_key: "key", events: [] };

describe("bounded Amplitude transport", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // Like the real fetch on a network that drops packets: no answer until the signal aborts.
  it("resolves null once the timeout passes on a request that never answers", async () => {
    vi.stubGlobal(
      "fetch",
      async (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        }),
    );

    const startedAt = Date.now();
    const response = await createBoundedTransport(50).send(SERVER_URL, PAYLOAD);

    expect(response).toBeNull();
    expect(Date.now() - startedAt).toBeLessThan(1000);
  });

  it("resolves null on a network error", async () => {
    vi.stubGlobal("fetch", async () => Promise.reject(new TypeError("fetch failed")));

    expect(await createBoundedTransport(50).send(SERVER_URL, PAYLOAD)).toBeNull();
  });

  it("builds the SDK response from Amplitude's answer", async () => {
    vi.stubGlobal(
      "fetch",
      async () => new Response(JSON.stringify({ code: 200, events_ingested: 1 }), { status: 200 }),
    );

    const response = await createBoundedTransport(50).send(SERVER_URL, PAYLOAD);

    expect(response).toMatchObject({ statusCode: 200, body: { eventsIngested: 1 } });
  });

  it("falls back to the HTTP status when the body is not JSON", async () => {
    vi.stubGlobal("fetch", async () => new Response("Bad Gateway", { status: 502 }));

    const response = await createBoundedTransport(50).send(SERVER_URL, PAYLOAD);

    expect(response).toMatchObject({ statusCode: 502 });
  });
});
