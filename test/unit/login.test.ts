import { beforeEach, describe, expect, it, vi } from "vitest";
import { performLogin } from "../../src/core/login/login.js";
import { loginViaDeviceFlow, refreshTokens } from "../../src/lib/auth/auth0.js";
import { createKeyringStorage } from "../../src/lib/auth/storage.js";
import type { TokenSet } from "../../src/lib/auth/types.js";
import { err, ok } from "../../src/lib/result.js";

vi.mock("../../src/lib/auth/storage.js", () => ({
  createKeyringStorage: vi.fn(),
}));

vi.mock("../../src/lib/auth/auth0.js", () => ({
  refreshTokens: vi.fn(),
  loginViaDeviceFlow: vi.fn(),
}));

vi.mock("../../src/core/user/user.js", () => ({
  ensureUserIdCached: vi.fn(async () => {}),
}));

const EXPIRED_TOKENS: TokenSet = {
  accessToken: "stale-access-token",
  refreshToken: "stale-refresh-token",
  expiresAt: 0,
  identifier: "old@example.com",
};

const FRESH_TOKENS: TokenSet = {
  accessToken: "new-access-token",
  refreshToken: "new-refresh-token",
  expiresAt: Number.MAX_SAFE_INTEGER,
  identifier: "new@example.com",
};

const fakeStorage = (stored: TokenSet | null) => ({
  read: vi.fn(async () => ok(stored)),
  write: vi.fn(async () => ok(undefined)),
  clear: vi.fn(async () => ok(undefined)),
});

describe("performLogin with a rejected refresh token", () => {
  beforeEach(() => {
    vi.mocked(refreshTokens).mockResolvedValue(
      err({ kind: "refresh-rejected", cause: new Error("invalid_grant") }),
    );
    vi.mocked(loginViaDeviceFlow).mockResolvedValue(ok(FRESH_TOKENS));
  });

  it("falls back to the device flow instead of failing the command", async () => {
    const storage = fakeStorage(EXPIRED_TOKENS);
    vi.mocked(createKeyringStorage).mockReturnValue(storage);

    const result = await performLogin({});

    expect(loginViaDeviceFlow).toHaveBeenCalledOnce();
    expect(result).toEqual(ok({ isAlreadyAuthenticated: false, identifier: "new@example.com" }));
  });

  it("clears the dead tokens and persists the ones from the device flow", async () => {
    const storage = fakeStorage(EXPIRED_TOKENS);
    vi.mocked(createKeyringStorage).mockReturnValue(storage);

    await performLogin({});

    expect(storage.clear).toHaveBeenCalledOnce();
    expect(storage.write).toHaveBeenCalledWith(FRESH_TOKENS);
  });
});

describe("performLogin when the refresh fails transiently", () => {
  it("keeps the stored session and surfaces the error without a device flow", async () => {
    const storage = fakeStorage(EXPIRED_TOKENS);
    vi.mocked(createKeyringStorage).mockReturnValue(storage);
    const transientError = { kind: "refresh-failed", cause: new Error("ETIMEDOUT") } as const;
    vi.mocked(refreshTokens).mockResolvedValue(err(transientError));

    const result = await performLogin({});

    expect(loginViaDeviceFlow).not.toHaveBeenCalled();
    expect(storage.clear).not.toHaveBeenCalled();
    expect(result).toEqual(err(transientError));
  });
});

describe("performLogin when the refresh succeeds", () => {
  it("does not start a device flow", async () => {
    const storage = fakeStorage(EXPIRED_TOKENS);
    vi.mocked(createKeyringStorage).mockReturnValue(storage);
    vi.mocked(refreshTokens).mockResolvedValue(ok(FRESH_TOKENS));

    const result = await performLogin({});

    expect(loginViaDeviceFlow).not.toHaveBeenCalled();
    expect(result).toEqual(ok({ isAlreadyAuthenticated: false, identifier: "new@example.com" }));
  });
});
