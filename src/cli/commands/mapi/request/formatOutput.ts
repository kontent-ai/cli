import { match, P } from "ts-pattern";
import type { ResolvedEnvId } from "../../../../core/environment/envId.js";
import { isErr, type Result } from "../../../../core/lib/result.js";
import type { AuthSource } from "../../../../core/mapi/credential.js";
import type { PassthroughResponse } from "../../../../core/passthrough/response.js";
import { authFailure, failureOutcome } from "../../shared/commandOutcome.js";
import { formatAuthError } from "../../shared/formatAuthError.js";
import {
  failedOutput,
  formatResponseOutput,
  MISSING_ENV_ID_OUTPUT,
  type PassthroughOutput,
} from "../../shared/passthroughOutput.js";
import type { RequestError, RequestOutcome } from "./runRequest.js";

export const formatRequestOutput = (
  result: Result<RequestOutcome, RequestError>,
  shouldIncludeHeaders: boolean,
): PassthroughOutput =>
  isErr(result)
    ? formatErrorOutput(result.error)
    : formatResponseOutput(result.value.response, {
        shouldIncludeHeaders,
        properties: { "auth-source": result.value.authSource },
        isLoginToken: result.value.authSource === "login",
        describeFailure: (response) =>
          formatFailure(response, result.value.authSource, result.value.env),
      });

const formatErrorOutput = (error: RequestError): PassthroughOutput =>
  match(error)
    .returnType<PassthroughOutput>()
    .with({ kind: "missing-env-id" }, () => MISSING_ENV_ID_OUTPUT)
    .with({ kind: "config-unreadable" }, (e) => failedOutput(e.kind, e.message))
    .with({ kind: "auth-failed" }, ({ error: authError }) =>
      failedOutput(
        authError.kind === "not-logged-in"
          ? "No Management API credential found. Run `kontent login`, or pass --mapiKey <key>, send an Authorization header, or set KONTENT_MAPI_KEY."
          : formatAuthError(authError),
        authFailure(authError),
      ),
    )
    .with({ kind: "invalid-endpoint" }, { kind: "transport" }, (e) =>
      failedOutput(e.message, failureOutcome(e.kind, { "auth-source": e.authSource })),
    )
    .with(
      { kind: "invalid-method" },
      { kind: "invalid-header" },
      { kind: "unreadable-input" },
      (e) => failedOutput(e.message, failureOutcome(e.kind)),
    )
    .exhaustive();

const formatFailure = (
  response: PassthroughResponse,
  authSource: AuthSource,
  env: ResolvedEnvId,
): string => {
  const summary = `HTTP ${response.statusCode}`;

  // A 401 on the login token never gets here: formatResponseOutput tells to log in again.
  return match({ statusCode: response.statusCode, authSource })
    .with(
      { statusCode: 401, authSource: P.not("login") },
      ({ authSource: source }) => `${summary}\n${formatCredentialHint(source)}`,
    )
    .with({ statusCode: 403 }, () =>
      env.source === "stored"
        ? `${summary}\nUsed the stored default environment ${env.envId}. If that's the wrong one, change it with \`kontent environment use <id>\`, or pass --envId <id> for this call only.`
        : summary,
    )
    .otherwise(() => summary);
};

const formatCredentialHint = (source: Exclude<AuthSource, "login">): string =>
  match(source)
    .with("header", () => "Check the Authorization header you supplied.")
    .with("mapi-key", () => "Check your Management API key.")
    .exhaustive();
