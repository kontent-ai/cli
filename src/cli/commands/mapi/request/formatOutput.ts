import { match } from "ts-pattern";
import type { ResolvedEnvId } from "../../../../core/environment/envId.js";
import { isErr, type Result } from "../../../../core/lib/result.js";
import type { AuthSource } from "../../../../core/mapi/credential.js";
import type { PassthroughResponse } from "../../../../core/passthrough/response.js";
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
        describeFailure: (response) =>
          formatFailure(response, result.value.authSource, result.value.env),
      });

const formatErrorOutput = (error: RequestError): PassthroughOutput =>
  match(error)
    .with({ kind: "missing-env-id" }, () => MISSING_ENV_ID_OUTPUT)
    .with({ kind: "auth-failed" }, ({ error: authError }) =>
      failedOutput(
        `auth:${authError.kind}`,
        authError.kind === "not-logged-in"
          ? "No Management API credential found. Run `kontent login`, or pass --mapiKey <key>, send an Authorization header, or set KONTENT_MAPI_KEY."
          : formatAuthError(authError),
      ),
    )
    .with({ kind: "invalid-endpoint" }, { kind: "transport" }, (e) =>
      failedOutput(e.kind, e.message, { "auth-source": e.authSource }),
    )
    .with(
      { kind: "invalid-method" },
      { kind: "invalid-header" },
      { kind: "unreadable-input" },
      (e) => failedOutput(e.kind, e.message),
    )
    .exhaustive();

const formatFailure = (
  response: PassthroughResponse,
  authSource: AuthSource,
  env: ResolvedEnvId,
): string => {
  const summary = `HTTP ${response.statusCode}`;

  return match(response.statusCode)
    .with(401, () => `${summary}\n${formatCredentialHint(authSource)}`)
    .with(403, () =>
      env.source === "stored"
        ? `${summary}\nUsed the stored default environment ${env.envId}. If that's the wrong one, change it with \`kontent environment use <id>\`, or pass --envId <id> for this call only.`
        : summary,
    )
    .otherwise(() => summary);
};

const formatCredentialHint = (source: AuthSource): string =>
  match(source)
    .with("header", () => "Check the Authorization header you supplied.")
    .with("mapi-key", () => "Check your Management API key.")
    .with("login", () => "Run `kontent login` to sign in again.")
    .exhaustive();
