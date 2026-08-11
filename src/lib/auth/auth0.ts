import {
  ClientError,
  type Configuration,
  discovery,
  initiateDeviceAuthorization,
  None,
  pollDeviceAuthorizationGrant,
  ResponseBodyError,
  refreshTokenGrant,
} from "openid-client";
import { match } from "ts-pattern";

import { err, isErr, ok, type Result, tryAsync } from "../result.js";
import type { Auth0Config } from "./config.js";
import { mapOpenIdTokensToTokenSet } from "./tokenSet.js";
import type { AuthError, TokenSet } from "./types.js";

export type DeviceCodeInfo = Readonly<{
  userCode: string;
  verificationUri: string;
  verificationUriComplete: string;
  expiresInSeconds: number;
}>;

export type DeviceFlowDeps = Readonly<{
  // `done` aborts once polling settles (success, denial, or expiry), letting the interaction
  // re-open the browser until then.
  onUserCode: (info: DeviceCodeInfo, done: AbortSignal) => Promise<void>;
  nowMs: () => number;
}>;

export const refreshTokens = async (
  config: Auth0Config,
  refreshToken: string,
): Promise<Result<TokenSet, AuthError>> => {
  const discovered = await discoverAuth0(config);
  if (isErr(discovered)) {
    return discovered;
  }

  const refreshed = await tryAsync(
    async () => refreshTokenGrant(discovered.value, refreshToken),
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

export const loginViaDeviceFlow = async (
  config: Auth0Config,
  deps: DeviceFlowDeps,
): Promise<Result<TokenSet, AuthError>> => {
  const discovered = await discoverAuth0(config);
  if (isErr(discovered)) {
    return discovered;
  }

  const handleResult = await tryAsync(
    async () =>
      initiateDeviceAuthorization(discovered.value, {
        scope: config.scope,
        audience: config.audience,
      }),
    (cause): AuthError => ({ kind: "device-auth-failed", cause }),
  );
  if (isErr(handleResult)) {
    return handleResult;
  }

  const handle = handleResult.value;
  const pollPromise = pollDeviceAuthorizationGrant(discovered.value, handle);
  const controller = new AbortController();
  void pollPromise.then(
    () => controller.abort(),
    () => controller.abort(),
  );

  await deps.onUserCode(
    {
      userCode: handle.user_code,
      verificationUri: handle.verification_uri,
      verificationUriComplete: handle.verification_uri_complete ?? handle.verification_uri,
      expiresInSeconds: handle.expires_in,
    },
    controller.signal,
  );

  try {
    const polled = await pollPromise;
    const issuedAtMs = deps.nowMs();
    return ok(mapOpenIdTokensToTokenSet(polled, issuedAtMs));
  } catch (cause) {
    return err(mapPollError(cause));
  }
};

// Pins the ID token signature algorithm, which would otherwise widen to whatever the
// tenant advertises in its discovery document.
const CLIENT_METADATA = { id_token_signed_response_alg: "RS256" };

/**
 * `None()` selects RFC 6749 public-client authentication: a CLI runs on the user's
 * machine and cannot hold a client secret, so the token request carries only
 * `client_id`. It is passed explicitly because `Configuration` infers the same default
 * when no `client_secret` is present, which makes the choice look accidental otherwise.
 */
const discoverAuth0 = async (config: Auth0Config): Promise<Result<Configuration, AuthError>> =>
  tryAsync(
    async () =>
      discovery(new URL(`https://${config.domain}`), config.clientId, CLIENT_METADATA, None()),
    (cause): AuthError => ({ kind: "discovery-failed", cause }),
  );

// RFC 6749 §5.2: invalid_grant means the refresh token itself is dead (expired,
// revoked, or rotated); any other failure may succeed on retry.
const isInvalidGrant = (cause: unknown): boolean =>
  cause instanceof ResponseBodyError && cause.error === "invalid_grant";

// authorization_pending and slow_down never reach here: pollDeviceAuthorizationGrant
// retries them internally and only rejects on terminal errors.
const mapPollError = (cause: unknown): AuthError => {
  // The library enforces the code's lifetime locally: pollDeviceAuthorizationGrant
  // installs an AbortSignal.timeout(expires_in), so an abandoned flow almost always
  // ends here rather than in the server's expired_token response.
  if (cause instanceof ClientError && cause.code === "OAUTH_TIMEOUT") {
    return { kind: "expired-token" };
  }

  if (!(cause instanceof ResponseBodyError)) {
    return { kind: "unknown", cause };
  }

  return match(cause.error)
    .with("access_denied", (): AuthError => ({ kind: "access-denied" }))
    .with("expired_token", (): AuthError => ({ kind: "expired-token" }))
    .otherwise(
      (code): AuthError => ({
        kind: "poll-failed",
        code,
        description: cause.error_description,
      }),
    );
};
