import { match } from "ts-pattern";
import { decideAfterRefreshFailure, decideAuth } from "../../../core/auth/decideAuth.js";
import type { AuthError } from "../../../core/auth/types.js";
import { err, isErr, ok, type Result } from "../../../core/lib/result.js";
import { type Clock, systemClock } from "../clock/clock.js";
import { createTokenRefresh, type TokenRefresh } from "./auth0.js";
import { getAuth0Config } from "./config.js";
import { createKeyringStorage, type TokenStorage } from "./storage.js";

export type Session = Readonly<{
  accessToken: () => Promise<Result<string, AuthError>>;
}>;

export type SessionEffects = Readonly<{
  tokens: TokenStorage;
  tokenRefresh: TokenRefresh;
  clock: Clock;
}>;

/**
 * The stored access token, refreshed when it has expired. Stored tokens are cleared only
 * when Auth0 rejects the refresh token as dead; transient failures keep the session so the
 * next run can retry silently.
 */
export const getValidAccessToken = async (
  effects: SessionEffects,
): Promise<Result<string, AuthError>> => {
  const stored = await effects.tokens.read();
  if (isErr(stored)) {
    return stored;
  }

  return await match(decideAuth(stored.value, effects.clock.now()))
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
        const refreshed = await effects.tokenRefresh.refresh(refreshToken);
        if (isErr(refreshed)) {
          if (decideAfterRefreshFailure(refreshed.error) === "keep-session") {
            return refreshed;
          }
          await effects.tokens.clear();
          // The tokens were just cleared, so the actionable state is "log in
          // again" rather than the raw invalid_grant response.
          return err({ kind: "not-logged-in" });
        }
        const written = await effects.tokens.write(refreshed.value);
        if (isErr(written)) {
          return written;
        }
        return ok(refreshed.value.accessToken);
      },
    )
    .exhaustive();
};

export const session: Session = {
  accessToken: async () =>
    getValidAccessToken({
      tokens: createKeyringStorage(),
      tokenRefresh: createTokenRefresh(getAuth0Config()),
      clock: systemClock,
    }),
};
