import { describe, expect, it } from "vitest";
import { decideAuth, EXPIRY_SKEW_MS } from "../../src/lib/auth/tokenAccess.js";
import type { TokenSet } from "../../src/lib/auth/types.js";

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
    expect(decideAuth(tokenSet(), NOW)).toEqual({
      type: "use-existing-token",
      accessToken: "access-token",
    });
  });

  it("uses the stored token while it is still live", () => {
    const tokens = tokenSet({ expiresAt: NOW + EXPIRY_SKEW_MS + 1 });
    expect(decideAuth(tokens, NOW)).toEqual({
      type: "use-existing-token",
      accessToken: "access-token",
    });
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
