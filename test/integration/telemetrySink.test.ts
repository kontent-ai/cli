import { type AddressInfo, createServer, type Server, type Socket } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createAmplitudeSink } from "../../src/cli/adapters/telemetry/sink.js";

const REQUEST_TIMEOUT_MS = 200;

// The process exits once the event's request is settled and its socket closed, so how long
// that takes bounds how long telemetry can hold up the CLI's exit.
describe("Amplitude sink against a server that never answers", () => {
  const sockets: Socket[] = [];
  let server: Server;
  let serverUrl: string;

  beforeAll(async () => {
    server = createServer((socket) => {
      sockets.push(socket);
    });
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });
    const { port } = server.address() as AddressInfo;
    serverUrl = `http://127.0.0.1:${port}/`;

    const realFetch = globalThis.fetch;
    vi.stubGlobal("fetch", async (_input: string, init: RequestInit) => realFetch(serverUrl, init));
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    for (const socket of sockets) {
      socket.destroy();
    }
    await new Promise((resolve) => {
      server.close(resolve);
    });
  });

  // A batching delay in the SDK would leave the event queued when the exit flush runs, and send
  // it only after the delay: the exit then waits for the delay plus the request timeout.
  it("gives up on an event within the request timeout of tracking it", async () => {
    const sink = createAmplitudeSink("test-api-key", REQUEST_TIMEOUT_MS);
    const startedAt = Date.now();

    const tracked = sink.track(
      { name: "cli__test", properties: {} },
      { deviceId: "device-id-value" },
    );
    await sink.flush();
    const outcome = await tracked;

    const elapsedMs = Date.now() - startedAt;
    expect(outcome.kind).toBe("rejected");
    // Sent once and given up on by the timeout, not failed before reaching the server.
    expect(sockets).toHaveLength(1);
    expect(elapsedMs).toBeGreaterThanOrEqual(REQUEST_TIMEOUT_MS - 20);
    expect(elapsedMs).toBeLessThan(REQUEST_TIMEOUT_MS + 500);
  });
});
