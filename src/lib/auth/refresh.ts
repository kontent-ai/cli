import { errors, Issuer } from "openid-client";

import { isErr, ok, type Result, tryAsync } from "../result.js";
import type { Auth0Config } from "./config.js";
import { mapOpenIdTokensToTokenSet } from "./mapTokens.js";
import type { AuthError, TokenSet } from "./types.js";

export const refreshTokens = async (
  config: Auth0Config,
  refreshToken: string,
): Promise<Result<TokenSet, AuthError>> => {
  const discovered = await tryAsync(
    async () => Issuer.discover(`https://${config.domain}`),
    (cause): AuthError => ({ kind: "discovery-failed", cause }),
  );
  if (isErr(discovered)) {
    return discovered;
  }

  const client = new discovered.value.Client({
    client_id: config.clientId,
    token_endpoint_auth_method: "none",
    id_token_signed_response_alg: "RS256",
  });

  const refreshed = await tryAsync(
    async () => client.refresh(refreshToken),
    (cause): AuthError =>
      isInvalidGrant(cause)
        ? { kind: "refresh-rejected", cause }
        : { kind: "refresh-failed", cause },
  );
  if (isErr(refreshed)) {
    return refreshed;
  }

  return ok(mapOpenIdTokensToTokenSet(refreshed.value, Date.now(), refreshToken));
};

// RFC 6749 §5.2: invalid_grant means the refresh token itself is dead (expired,
// revoked, or rotated); any other failure may succeed on retry.
const isInvalidGrant = (cause: unknown): boolean =>
  cause instanceof errors.OPError && cause.error === "invalid_grant";
