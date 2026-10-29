import { describe, expect, it } from "vitest";
import { getValidAccessToken } from "../../src/cli/adapters/auth/tokenAccess.js";
import type { AuthError, TokenSet } from "../../src/core/auth/types.js";
import { err, ok, type Result } from "../../src/core/lib/result.js";
import { fakeTokenRefresh, fakeTokenStorage } from "../helpers/authFakes.js";

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

const REJECTED: AuthError = { kind: "refresh-rejected", cause: new Error("invalid_grant") };
const TRANSIENT: AuthError = { kind: "refresh-failed", cause: new Error("ETIMEDOUT") };

const effectsWith = (refreshed: Result<TokenSet, AuthError>) => ({
  tokens: fakeTokenStorage(EXPIRED_TOKENS),
  tokenRefresh: fakeTokenRefresh(refreshed),
  clock: { now: () => 1_000 },
});

describe("getValidAccessToken with an expired access token", () => {
  it("clears the stored tokens and maps a rejected refresh token to not-logged-in", async () => {
    const effects = effectsWith(err(REJECTED));

    const result = await getValidAccessToken(effects);

    expect(effects.tokens.clear).toHaveBeenCalledOnce();
    expect(result).toEqual(err({ kind: "not-logged-in" }));
  });

  it("surfaces a transient refresh failure and keeps the session", async () => {
    const effects = effectsWith(err(TRANSIENT));

    const result = await getValidAccessToken(effects);

    expect(effects.tokens.clear).not.toHaveBeenCalled();
    expect(result).toEqual(err(TRANSIENT));
  });

  it("persists and returns the refreshed token", async () => {
    const effects = effectsWith(ok(FRESH_TOKENS));

    const result = await getValidAccessToken(effects);

    expect(effects.tokens.write).toHaveBeenCalledWith(FRESH_TOKENS);
    expect(result).toEqual(ok("new-access-token"));
  });
});
