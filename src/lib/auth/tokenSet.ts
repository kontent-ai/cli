import type { TokenEndpointResponse } from "openid-client";

import type { TokenSet } from "./types.js";

export const mapOpenIdTokensToTokenSet = (
  tokens: TokenEndpointResponse,
  issuedAtMs: number,
  fallbackRefreshToken?: string,
): TokenSet => ({
  accessToken: tokens.access_token,
  refreshToken: tokens.refresh_token ?? fallbackRefreshToken,
  expiresAt: tokens.expires_in !== undefined ? issuedAtMs + tokens.expires_in * 1000 : undefined,
  identifier: deriveIdentifier(tokens.id_token),
});

const deriveIdentifier = (idToken: string | undefined): string | undefined => {
  if (idToken === undefined) {
    return undefined;
  }

  const email = decodeIdTokenClaims(idToken).email;
  return typeof email === "string" && email.length > 0 ? email : undefined;
};

const decodeIdTokenClaims = (idToken: string): Record<string, unknown> => {
  const parts = idToken.split(".");
  const payload = parts[1];
  if (payload === undefined) {
    return {};
  }
  try {
    const json = Buffer.from(payload, "base64url").toString("utf8");
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return {};
  }
};
