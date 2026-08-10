import { describe, expect, it, vi } from "vitest";
import { refreshTokens } from "../../src/lib/auth/auth0.js";
import type { Auth0Config } from "../../src/lib/auth/config.js";
import { createKeyringStorage } from "../../src/lib/auth/storage.js";
import { getValidAccessToken, refreshOrClear } from "../../src/lib/auth/tokenAccess.js";
import type { TokenSet } from "../../src/lib/auth/types.js";
import { err, ok } from "../../src/lib/result.js";

vi.mock("../../src/lib/auth/auth0.js", () => ({
  refreshTokens: vi.fn(),
}));

vi.mock("../../src/lib/auth/storage.js", () => ({
  createKeyringStorage: vi.fn(),
}));

const CONFIG: Auth0Config = {
  domain: "example.auth0.com",
  clientId: "client-id",
  audience: "https://example.test/api",
  scope: "openid profile email offline_access",
};

vi.mock("../../src/lib/auth/config.js", () => ({
  getAuth0Config: vi.fn(() => ({
    domain: "example.auth0.com",
    clientId: "client-id",
    audience: "https://example.test/api",
    scope: "openid profile email offline_access",
  })),
}));

const EXPIRED_TOKENS: TokenSet = {
  accessToken: "stale-access-token",
  refreshToken: "stale-refresh-token",
  expiresAt: 0,
};

const FRESH_TOKENS: TokenSet = {
  accessToken: "new-access-token",
  refreshToken: "new-refresh-token",
  expiresAt: Number.MAX_SAFE_INTEGER,
};

const REJECTED = { kind: "refresh-rejected", cause: new Error("invalid_grant") } as const;
const TRANSIENT = { kind: "refresh-failed", cause: new Error("ETIMEDOUT") } as const;

const fakeStorage = (stored: TokenSet | null) => ({
  read: vi.fn(async () => ok(stored)),
  write: vi.fn(async () => ok(undefined)),
  clear: vi.fn(async () => ok(undefined)),
});

describe("refreshOrClear", () => {
  it("clears stored tokens when the refresh token is rejected", async () => {
    const storage = fakeStorage(EXPIRED_TOKENS);
    vi.mocked(refreshTokens).mockResolvedValue(err(REJECTED));

    const result = await refreshOrClear(storage, CONFIG, "stale-refresh-token");

    expect(storage.clear).toHaveBeenCalledOnce();
    expect(result).toEqual(err(REJECTED));
  });

  it("keeps stored tokens on a transient refresh failure", async () => {
    const storage = fakeStorage(EXPIRED_TOKENS);
    vi.mocked(refreshTokens).mockResolvedValue(err(TRANSIENT));

    const result = await refreshOrClear(storage, CONFIG, "stale-refresh-token");

    expect(storage.clear).not.toHaveBeenCalled();
    expect(result).toEqual(err(TRANSIENT));
  });
});

describe("getValidAccessToken with an expired access token", () => {
  it("maps a rejected refresh token to not-logged-in", async () => {
    const storage = fakeStorage(EXPIRED_TOKENS);
    vi.mocked(createKeyringStorage).mockReturnValue(storage);
    vi.mocked(refreshTokens).mockResolvedValue(err(REJECTED));

    const result = await getValidAccessToken();

    expect(storage.clear).toHaveBeenCalledOnce();
    expect(result).toEqual(err({ kind: "not-logged-in" }));
  });

  it("surfaces a transient refresh failure and keeps the session", async () => {
    const storage = fakeStorage(EXPIRED_TOKENS);
    vi.mocked(createKeyringStorage).mockReturnValue(storage);
    vi.mocked(refreshTokens).mockResolvedValue(err(TRANSIENT));

    const result = await getValidAccessToken();

    expect(storage.clear).not.toHaveBeenCalled();
    expect(result).toEqual(err(TRANSIENT));
  });

  it("persists and returns the refreshed token", async () => {
    const storage = fakeStorage(EXPIRED_TOKENS);
    vi.mocked(createKeyringStorage).mockReturnValue(storage);
    vi.mocked(refreshTokens).mockResolvedValue(ok(FRESH_TOKENS));

    const result = await getValidAccessToken();

    expect(storage.write).toHaveBeenCalledWith(FRESH_TOKENS);
    expect(result).toEqual(ok("new-access-token"));
  });
});
