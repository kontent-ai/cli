import { describe, expect, it, vi } from "vitest";
import { MAX_RETRY_DELAY_MS } from "../../src/cli/adapters/http/retryDelay.js";
import { createIapiClient } from "../../src/cli/adapters/iapi/client.js";
import { createDeliveryKeys } from "../../src/cli/adapters/iapi/deliveryKeys.js";
import { createUsers } from "../../src/cli/adapters/iapi/users.js";
import { assertErr, assertOk } from "../helpers/assertResult.js";
import { httpTestAdapter } from "../helpers/httpTestAdapter.js";
import { nodeFetchTimeoutError } from "../helpers/nodeFetchTimeoutError.js";

const baseUrl = { protocol: "https", host: "iapi.test" } as const;

const networkError = (): Error =>
  new TypeError("fetch failed", { cause: new Error("read ECONNRESET") });

describe("createIapiClient", () => {
  it("retries a GET after a network error", async () => {
    const { adapter, requests } = httpTestAdapter([
      {
        method: "GET",
        path: /\/api\/user$/,
        replies: [{ throws: networkError() }, { payload: { userId: "user-1" } }],
      },
    ]);
    const users = createUsers(createIapiClient({ token: "test-token", baseUrl, adapter }));

    const result = await users.current();

    assertOk(result);
    expect(result.value.userId).toBe("user-1");
    expect(requests).toHaveLength(2);
  });

  it("does not resend a GET that hit Node's headers timeout", async () => {
    const { adapter, requests } = httpTestAdapter([
      {
        method: "GET",
        path: /\/api\/user$/,
        replies: [
          { throws: nodeFetchTimeoutError("UND_ERR_HEADERS_TIMEOUT") },
          { payload: { userId: "user-1" } },
        ],
      },
    ]);
    const users = createUsers(createIapiClient({ token: "test-token", baseUrl, adapter }));

    const result = await users.current();

    assertErr(result);
    expect(requests).toHaveLength(1);
  });

  it("does not resend a POST after a network error", async () => {
    // If the POST were resent, the second reply would create the key and both asserts fail.
    const { adapter, requests } = httpTestAdapter([
      {
        method: "POST",
        path: /\/keys$/,
        replies: [{ throws: networkError() }, { payload: { name: "Key", api_key: "secret" } }],
      },
    ]);
    const deliveryKeys = createDeliveryKeys(
      createIapiClient({ token: "test-token", baseUrl, adapter }),
    );

    const result = await deliveryKeys.create("container-1", {
      name: "Key",
      environments: ["env-1"],
      hasPreviewDeliveryAccess: false,
      expiresAt: new Date("2030-01-01T00:00:00Z"),
    });

    assertErr(result);
    expect(result.error.details.reason).toBe("adapterError");
    expect(requests).toHaveLength(1);
  });

  it("waits no longer than the retry cap when a 429 asks for more", async () => {
    vi.useFakeTimers();
    try {
      const { adapter, requests } = httpTestAdapter([
        {
          method: "GET",
          path: /\/api\/user$/,
          replies: [
            {
              status: 429,
              statusText: "Too Many Requests",
              headers: [{ name: "Retry-After", value: "120" }],
            },
            { payload: { userId: "user-1" } },
          ],
        },
      ]);
      const pending = createUsers(
        createIapiClient({ token: "test-token", baseUrl, adapter }),
      ).current();

      await vi.advanceTimersByTimeAsync(MAX_RETRY_DELAY_MS - 1);
      expect(requests).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(1);

      const result = await pending;
      expect(requests).toHaveLength(2);
      assertOk(result);
    } finally {
      vi.useRealTimers();
    }
  });
});
