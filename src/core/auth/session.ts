import type { AuthDecision, AuthError, TokenSet } from "./types.js";

export const EXPIRY_SKEW_MS = 60_000;

export const decideAuth = (tokens: TokenSet | null, nowMs: number): AuthDecision => {
  if (tokens === null) {
    return { type: "login" };
  }

  const isAccessTokenLive =
    tokens.expiresAt === undefined || tokens.expiresAt - EXPIRY_SKEW_MS > nowMs;

  if (isAccessTokenLive) {
    return { type: "use-existing-token", tokens };
  }

  if (tokens.refreshToken !== undefined) {
    return { type: "refresh-token", refreshToken: tokens.refreshToken };
  }

  return { type: "login" };
};

export type RefreshFailureDecision = "sign-in-again" | "keep-session";

// Only a dead refresh token warrants a new sign-in. A transient failure (network, Auth0
// down) would kill the device flow at the same place, so the session is kept for a retry.
export const decideAfterRefreshFailure = (error: AuthError): RefreshFailureDecision =>
  error.kind === "refresh-rejected" ? "sign-in-again" : "keep-session";

// Only these end in "run `kontent login`": the others are transient, or a login would
// fail the same way.
export const isLoginRequired = (error: AuthError): boolean =>
  error.kind === "not-logged-in" || error.kind === "session-expired";

// A 401 on the stored login token means the session is dead and `kontent login` fixes it.
// A 401 on a key or header the user supplied is theirs to fix: a new login changes nothing.
export const isSessionRejected = (
  response: Readonly<{ status: number | undefined; isLoginToken: boolean }>,
): boolean => response.status === 401 && response.isLoginToken;
