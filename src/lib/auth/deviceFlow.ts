import { errors, Issuer } from "openid-client";
import { match } from "ts-pattern";

import { err, isErr, ok, type Result, tryAsync } from "../result.js";
import type { Auth0Config } from "./config.js";
import { mapOpenIdTokensToTokenSet } from "./mapTokens.js";
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

export const loginViaDeviceFlow = async (
  config: Auth0Config,
  deps: DeviceFlowDeps,
): Promise<Result<TokenSet, AuthError>> => {
  const issuerResult = await tryAsync(
    async () => Issuer.discover(`https://${config.domain}`),
    (cause): AuthError => ({ kind: "discovery-failed", cause }),
  );
  if (isErr(issuerResult)) {
    return issuerResult;
  }

  const client = new issuerResult.value.Client({
    client_id: config.clientId,
    token_endpoint_auth_method: "none",
    id_token_signed_response_alg: "RS256",
  });

  const handleResult = await tryAsync(
    async () => client.deviceAuthorization({ scope: config.scope, audience: config.audience }),
    (cause): AuthError => ({ kind: "device-auth-failed", cause }),
  );
  if (isErr(handleResult)) {
    return handleResult;
  }

  const handle = handleResult.value;
  const pollPromise = handle.poll();
  const controller = new AbortController();
  void pollPromise.then(
    () => controller.abort(),
    () => controller.abort(),
  );

  await deps.onUserCode(
    {
      userCode: handle.user_code,
      verificationUri: handle.verification_uri,
      verificationUriComplete: handle.verification_uri_complete,
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

const mapPollError = (cause: unknown): AuthError => {
  if (!(cause instanceof errors.OPError)) {
    return { kind: "unknown", cause };
  }

  return match(cause.error)
    .with("access_denied", (): AuthError => ({ kind: "access-denied" }))
    .with("expired_token", (): AuthError => ({ kind: "expired-token" }))
    .with("slow_down", (): AuthError => ({ kind: "slow-down" }))
    .otherwise(
      (code): AuthError => ({
        kind: "poll-failed",
        code: code ?? "unknown",
        description: cause.error_description,
      }),
    );
};
