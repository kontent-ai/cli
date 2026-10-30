import { describe, expect, it } from "vitest";
import { getValidTokens } from "../../src/cli/adapters/auth/tokenAccess.js";
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

describe("getValidTokens with an expired access token", () => {
  it("clears the stored tokens and maps a rejected refresh token to session-expired", async () => {
    const effects = effectsWith(err(REJECTED));

    const result = await getValidTokens(effects);

    expect(effects.tokens.clear).toHaveBeenCalledOnce();
    expect(result).toEqual(err({ kind: "session-expired", refreshError: REJECTED }));
  });

  it("surfaces a transient refresh failure and keeps the session", async () => {
    const effects = effectsWith(err(TRANSIENT));

    const result = await getValidTokens(effects);

    expect(effects.tokens.clear).not.toHaveBeenCalled();
    expect(result).toEqual(err(TRANSIENT));
  });

  it("persists and returns the refreshed tokens", async () => {
    const effects = effectsWith(ok(FRESH_TOKENS));

    const result = await getValidTokens(effects);

    expect(effects.tokens.write).toHaveBeenCalledWith(FRESH_TOKENS);
    expect(result).toEqual(ok(FRESH_TOKENS));
  });
});
