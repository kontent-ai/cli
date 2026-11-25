import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { HttpService } from "@kontent-ai/core-sdk-v10";
import { createManagementClient } from "@kontent-ai/management-sdk";
import { afterEach, describe, expect, it } from "vitest";
import {
  createMapiClient,
  mapiAxiosRequestConfig,
  mapiRetryStrategy,
} from "../../src/cli/adapters/mapi/client.js";
import { mapiErrorMessage } from "../../src/cli/adapters/mapi/error.js";

// Real axios against a local server: the management-sdk has no transport seam of its own.
const servers: Server[] = [];

afterEach(() => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    server.close();
  }
});

const listen = async (server: Server): Promise<string> => {
  servers.push(server);
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
};

describe("createMapiClient", () => {
  it("sends a failing GET at most three times", { timeout: 15_000 }, async () => {
    const requestCounter = { count: 0 };
    const baseUrl = await listen(
      createServer((_request, response) => {
        requestCounter.count += 1;
        response.writeHead(503).end();
      }),
    );
    const client = createMapiClient({ token: "test-token", envId: "env", baseUrl });

    await expect(client.environmentInformation().toPromise()).rejects.toBeDefined();
    expect(requestCounter.count).toBe(3);
  });

  it("resends a POST answered 503, at most three times", { timeout: 15_000 }, async () => {
    const requestCounter = { count: 0 };
    const baseUrl = await listen(
      createServer((request, response) => {
        requestCounter.count += request.method === "POST" ? 1 : 0;
        response.writeHead(503).end();
      }),
    );
    const client = createMapiClient({ token: "test-token", envId: "env", baseUrl });

    await expect(
      client.addSpace().withData({ name: "Space", codename: "space" }).toPromise(),
    ).rejects.toBeDefined();
    expect(requestCounter.count).toBe(3);
  });

  it("does not resend a GET that timed out", async () => {
    const requestCounter = { count: 0 };
    const baseUrl = await listen(
      createServer(() => {
        requestCounter.count += 1;
      }),
    );
    // The client's own config with a 50 ms timeout, so the test need not wait 30 s per send.
    const client = createManagementClient({
      environmentId: "env",
      apiKey: "test-token",
      baseUrl,
      httpService: new HttpService({
        logErrorsToConsole: false,
        axiosRequestConfig: { ...mapiAxiosRequestConfig, timeout: 50 },
      }),
      retryStrategy: mapiRetryStrategy,
    });

    await expect(client.environmentInformation().toPromise()).rejects.toBeDefined();
    expect(requestCounter.count).toBe(1);
  });

  it("prints the configured timeout message", async () => {
    const baseUrl = await listen(createServer(() => undefined));
    const httpService = new HttpService({
      logErrorsToConsole: false,
      axiosRequestConfig: { ...mapiAxiosRequestConfig, timeout: 50 },
    });

    const error: unknown = await httpService.getAsync({ url: `${baseUrl}/` }).catch((e) => e);

    expect(mapiErrorMessage(error)).toBe("Request timed out after 30 s.");
  });
});
