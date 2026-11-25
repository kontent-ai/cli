import { describe, expect, it } from "vitest";
import {
  decideAfterRefreshFailure,
  decideAuth,
  EXPIRY_SKEW_MS,
  isLoginRequired,
  isSessionRejected,
} from "../../src/core/auth/session.js";
import type { TokenSet } from "../../src/core/auth/types.js";

const NOW = 1_000_000;

const tokenSet = (overrides: Partial<TokenSet> = {}): TokenSet => ({
  accessToken: "access-token",
  ...overrides,
});

describe("decideAuth", () => {
  it("logs in when nothing is stored", () => {
    expect(decideAuth(null, NOW)).toEqual({ type: "login" });
  });

  it("uses the stored token when it carries no expiry", () => {
    expect(decideAuth(tokenSet(), NOW)).toEqual({ type: "use-existing-token", tokens: tokenSet() });
  });

  it("uses the stored token while it is still live", () => {
    const tokens = tokenSet({ expiresAt: NOW + EXPIRY_SKEW_MS + 1 });
    expect(decideAuth(tokens, NOW)).toEqual({ type: "use-existing-token", tokens });
  });

  it("treats a token expiring within the skew window as expired", () => {
    const tokens = tokenSet({ expiresAt: NOW + EXPIRY_SKEW_MS, refreshToken: "refresh-token" });
    expect(decideAuth(tokens, NOW)).toEqual({
      type: "refresh-token",
      refreshToken: "refresh-token",
    });
  });

  it("refreshes an expired token when a refresh token is stored", () => {
    const tokens = tokenSet({ expiresAt: NOW - 1, refreshToken: "refresh-token" });
    expect(decideAuth(tokens, NOW)).toEqual({
      type: "refresh-token",
      refreshToken: "refresh-token",
    });
  });

  it("logs in when the token expired and no refresh token is stored", () => {
    expect(decideAuth(tokenSet({ expiresAt: NOW - 1 }), NOW)).toEqual({ type: "login" });
  });
});

describe("decideAfterRefreshFailure", () => {
  it.each([
    [{ kind: "refresh-rejected", cause: new Error("invalid_grant") }, "sign-in-again"],
    [{ kind: "refresh-failed", cause: new Error("ETIMEDOUT") }, "keep-session"],
    [{ kind: "discovery-failed", cause: new Error("ENOTFOUND") }, "keep-session"],
  ] as const)("maps %o to %s", (error, expected) => {
    expect(decideAfterRefreshFailure(error)).toBe(expected);
  });
});

describe("isLoginRequired", () => {
  it.each([
    [{ kind: "not-logged-in" }, true],
    [{ kind: "session-expired", refreshError: { kind: "refresh-rejected", cause: null } }, true],
    [{ kind: "expired-token" }, false],
    [{ kind: "access-denied" }, false],
    [{ kind: "refresh-failed", cause: new Error("ETIMEDOUT") }, false],
    [{ kind: "storage-read-failed", cause: new Error("locked") }, false],
  ] as const)("maps %o to %s", (error, expected) => {
    expect(isLoginRequired(error)).toBe(expected);
  });
});

describe("isSessionRejected", () => {
  it.each([
    [{ status: 401, isLoginToken: true }, true],
    [{ status: 401, isLoginToken: false }, false],
    [{ status: 403, isLoginToken: true }, false],
    [{ status: 500, isLoginToken: true }, false],
    [{ status: undefined, isLoginToken: true }, false],
  ] as const)("maps %o to %s", (response, expected) => {
    expect(isSessionRejected(response)).toBe(expected);
  });
});
