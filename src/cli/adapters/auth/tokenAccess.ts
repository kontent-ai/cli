import { match } from "ts-pattern";
import type { LoginContext } from "../../../core/auth/loginContext.js";
import { decideAfterRefreshFailure, decideAuth } from "../../../core/auth/session.js";
import type { AuthError, TokenSet } from "../../../core/auth/types.js";
import { err, isErr, ok, type Result } from "../../../core/lib/result.js";
import { type Clock, systemClock } from "../clock/clock.js";
import { createTokenRefresh, type TokenRefresh } from "./auth0.js";
import type { Auth0Config } from "./config.js";
import { createKeyringStorage, type TokenStorage } from "./storage.js";

/** The stored login a run uses, and the Auth0 settings that sign it in and refresh it. */
export type LoginSetup = Readonly<{
  context: LoginContext;
  auth0: Auth0Config;
}>;

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

export const createSession = (login: LoginSetup): Session => ({
  tokens: async () =>
    getValidTokens({
      tokens: createKeyringStorage(login.context),
      tokenRefresh: createTokenRefresh(login.auth0, systemClock),
      clock: systemClock,
    }),
});
