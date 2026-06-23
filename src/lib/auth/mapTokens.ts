import type { TokenSet as OpenIdTokenSet } from "openid-client";

import type { TokenSet } from "./types.js";

export const mapOpenIdTokensToTokenSet = (
  tokens: OpenIdTokenSet,
  issuedAtMs: number,
  fallbackRefreshToken?: string,
): TokenSet => {
  if (tokens.access_token === undefined) {
    throw new Error("openid-client returned no access_token");
  }

  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? fallbackRefreshToken,
    idToken: tokens.id_token,
    expiresAt: tokens.expires_in !== undefined ? issuedAtMs + tokens.expires_in * 1000 : undefined,
    scope: tokens.scope,
    tokenType: tokens.token_type,
  };
};
