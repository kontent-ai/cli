import {
  ClientError,
  initiateDeviceAuthorization,
  pollDeviceAuthorizationGrant,
} from "openid-client";
import { describe, expect, it, vi } from "vitest";
import { type DeviceFlowDeps, loginViaDeviceFlow } from "../../src/lib/auth/auth0.js";
import type { Auth0Config } from "../../src/lib/auth/config.js";
import { err } from "../../src/lib/result.js";

// The real error classes stay: mapPollError branches on instanceof.
vi.mock("openid-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("openid-client")>()),
  discovery: vi.fn(async () => ({})),
  initiateDeviceAuthorization: vi.fn(),
  pollDeviceAuthorizationGrant: vi.fn(),
}));

const CONFIG: Auth0Config = {
  domain: "example.auth0.com",
  clientId: "client-id",
  audience: "https://example.test/api",
  scope: "openid profile email offline_access",
};

const DEPS: DeviceFlowDeps = {
  onUserCode: async () => {},
  nowMs: () => 1_000_000,
};

const DEVICE_CODE = {
  user_code: "ABCD-EFGH",
  verification_uri: "https://example.auth0.com/activate",
  verification_uri_complete: "https://example.auth0.com/activate?code=ABCD-EFGH",
  expires_in: 900,
};

// The declared constructor is Error's, so `code` is assigned rather than passed.
const clientError = (message: string, code: string): ClientError => {
  const error = new ClientError(message);
  error.code = code;
  return error;
};

const pollRejectsWith = (cause: unknown): void => {
  vi.mocked(initiateDeviceAuthorization).mockResolvedValue(
    DEVICE_CODE as unknown as Awaited<ReturnType<typeof initiateDeviceAuthorization>>,
  );
  vi.mocked(pollDeviceAuthorizationGrant).mockRejectedValue(cause);
};

describe("loginViaDeviceFlow polling failures", () => {
  it("maps the client-side expiry timeout to expired-token", async () => {
    pollRejectsWith(clientError("operation timed out", "OAUTH_TIMEOUT"));

    const result = await loginViaDeviceFlow(CONFIG, DEPS);

    expect(result).toEqual(err({ kind: "expired-token" }));
  });

  it("leaves other client errors as unknown", async () => {
    const cause = clientError("operation aborted", "OAUTH_ABORT");
    pollRejectsWith(cause);

    const result = await loginViaDeviceFlow(CONFIG, DEPS);

    expect(result).toEqual(err({ kind: "unknown", cause }));
  });

  it("leaves unrecognised failures as unknown", async () => {
    const cause = new Error("ECONNRESET");
    pollRejectsWith(cause);

    const result = await loginViaDeviceFlow(CONFIG, DEPS);

    expect(result).toEqual(err({ kind: "unknown", cause }));
  });
});
