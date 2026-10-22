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

export type RefreshFailureDecision = "sign-in-again" | "keep-session";

// Only a dead refresh token warrants a new sign-in. A transient failure (network, Auth0
// down) would kill the device flow at the same place, so the session is kept for a retry.
export const decideAfterRefreshFailure = (error: AuthError): RefreshFailureDecision =>
  error.kind === "refresh-rejected" ? "sign-in-again" : "keep-session";
