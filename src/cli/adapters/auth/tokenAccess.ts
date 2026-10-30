import { match } from "ts-pattern";
import { decideAfterRefreshFailure, decideAuth } from "../../../core/auth/decideAuth.js";
import type { AuthError, TokenSet } from "../../../core/auth/types.js";
import { err, isErr, ok, type Result } from "../../../core/lib/result.js";
import { type Clock, systemClock } from "../clock/clock.js";
import { createTokenRefresh, type TokenRefresh } from "./auth0.js";
import { getAuth0Config } from "./config.js";
import { createKeyringStorage, type TokenStorage } from "./storage.js";

export type Session = Readonly<{
  tokens: () => Promise<Result<TokenSet, AuthError>>;
}>;

export type SessionEffects = Readonly<{
  tokens: TokenStorage;
  tokenRefresh: TokenRefresh;
  clock: Clock;
}>;

/**
 * The stored tokens, refreshed and saved again when the access token has expired. Stored
 * tokens are cleared only when Auth0 rejects the refresh token as dead; transient failures
 * keep the session so the next run can retry silently.
 */
export const getValidTokens = async (
  effects: SessionEffects,
): Promise<Result<TokenSet, AuthError>> => {
  const stored = await effects.tokens.read();
  if (isErr(stored)) {
    return stored;
  }

  return await match(decideAuth(stored.value, effects.clock.now()))
    .with(
      { type: "use-existing-token" },
      async ({ tokens }): Promise<Result<TokenSet, AuthError>> => ok(tokens),
    )
    .with(
      { type: "login" },
      async (): Promise<Result<TokenSet, AuthError>> => err({ kind: "not-logged-in" }),
    )
    .with(
      { type: "refresh-token" },
      async ({ refreshToken }): Promise<Result<TokenSet, AuthError>> => {
        const refreshed = await effects.tokenRefresh.refresh(refreshToken);
        if (isErr(refreshed)) {
          if (decideAfterRefreshFailure(refreshed.error) === "keep-session") {
            return refreshed;
          }
          await effects.tokens.clear();
          return err({ kind: "session-expired", refreshError: refreshed.error });
        }
        const written = await effects.tokens.write(refreshed.value);
        if (isErr(written)) {
          return written;
        }
        return ok(refreshed.value);
      },
    )
    .exhaustive();
};

export const session: Session = {
  tokens: async () =>
    getValidTokens({
      tokens: createKeyringStorage(),
      tokenRefresh: createTokenRefresh(getAuth0Config(), systemClock),
      clock: systemClock,
    }),
};
