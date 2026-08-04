import { match } from "ts-pattern";

import { err, isErr, ok, type Result } from "../result.js";
import { type Auth0Config, getAuth0Config } from "./config.js";
import { refreshTokens } from "./refresh.js";
import { createKeyringStorage, type TokenStorage } from "./storage.js";
import type { AuthDecision, AuthError, TokenSet } from "./types.js";

export const EXPIRY_SKEW_MS = 60_000;

export const decideAuth = (tokens: TokenSet | null, nowMs: number): AuthDecision => {
  if (tokens === null) {
    return { type: "login" };
  }

  const isAccessTokenLive =
    tokens.expiresAt === undefined || tokens.expiresAt - EXPIRY_SKEW_MS > nowMs;

  if (isAccessTokenLive) {
    return { type: "use-existing-token", accessToken: tokens.accessToken };
  }

  if (tokens.refreshToken !== undefined) {
    return { type: "refresh-token", refreshToken: tokens.refreshToken };
  }

  return { type: "login" };
};

/**
 * Refreshes the token set. Clears stored tokens only when Auth0 rejects the
 * refresh token as dead; transient failures keep the session so the next run
 * can retry silently.
 */
export const refreshOrClear = async (
  storage: TokenStorage,
  config: Auth0Config,
  refreshToken: string,
): Promise<Result<TokenSet, AuthError>> => {
  const refreshed = await refreshTokens(config, refreshToken);
  if (isErr(refreshed) && refreshed.error.kind === "refresh-rejected") {
    await storage.clear();
  }
  return refreshed;
};

export const getValidAccessToken = async (): Promise<Result<string, AuthError>> => {
  const storage = createKeyringStorage();
  const stored = await storage.read();
  if (isErr(stored)) {
    return stored;
  }

  const decision = decideAuth(stored.value, Date.now());

  return await match(decision)
    .with(
      { type: "use-existing-token" },
      async ({ accessToken }): Promise<Result<string, AuthError>> => ok(accessToken),
    )
    .with(
      { type: "login" },
      async (): Promise<Result<string, AuthError>> => err({ kind: "not-logged-in" }),
    )
    .with(
      { type: "refresh-token" },
      async ({ refreshToken }): Promise<Result<string, AuthError>> => {
        const refreshed = await refreshOrClear(storage, getAuth0Config(), refreshToken);
        if (isErr(refreshed)) {
          if (refreshed.error.kind === "refresh-rejected") {
            // The tokens were just cleared, so the actionable state is "log in
            // again" rather than the raw invalid_grant response.
            return err({ kind: "not-logged-in" });
          }
          return refreshed;
        }
        const written = await storage.write(refreshed.value);
        if (isErr(written)) {
          return written;
        }
        return ok(refreshed.value.accessToken);
      },
    )
    .exhaustive();
};
