import type { TokenEndpointResponse, TokenEndpointResponseHelpers } from "openid-client";

import type { TokenSet } from "./types.js";

export const mapOpenIdTokensToTokenSet = (
  tokens: TokenEndpointResponse & TokenEndpointResponseHelpers,
  issuedAtMs: number,
  fallbackRefreshToken?: string,
): TokenSet => ({
  accessToken: tokens.access_token,
  refreshToken: tokens.refresh_token ?? fallbackRefreshToken,
  expiresAt: tokens.expires_in !== undefined ? issuedAtMs + tokens.expires_in * 1000 : undefined,
  identifier: deriveIdentifier(tokens),
});

const deriveIdentifier = (
  tokens: TokenEndpointResponse & TokenEndpointResponseHelpers,
): string | undefined => {
  const email = tokens.claims()?.email;
  return typeof email === "string" && email.length > 0 ? email : undefined;
};
