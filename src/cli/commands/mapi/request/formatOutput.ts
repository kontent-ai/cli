import { match } from "ts-pattern";
import type { ResolvedEnvId } from "../../../../core/environment/decideEnvId.js";
import { isErr, type Result } from "../../../../core/lib/result.js";
import type { AuthSource } from "../../../../core/mapi/decideMapiCredential.js";
import type { MapiResponse } from "../../../../core/mapi/raw/response.js";
import type { EventProperties } from "../../../../core/telemetry/events.js";
import { formatAuthError } from "../../shared/formatAuthError.js";
import { presentResponse } from "./presentResponse.js";
import type { RequestError, RequestOutcome } from "./runRequest.js";

export type StderrLine = Readonly<{ level: "info" | "warning" | "error"; text: string }>;

export type RequestOutput = Readonly<{
  stdout: string;
  stderr: ReadonlyArray<StderrLine>;
  isFailure: boolean;
  telemetry:
    | Readonly<{ outcome: "succeed"; properties: EventProperties }>
    | Readonly<{ outcome: "fail"; errorCode: string; properties?: EventProperties }>;
}>;

/** Everything the command writes, decided as data so the streams can be asserted on. */
export const formatRequestOutput = (
  result: Result<RequestOutcome, RequestError>,
  shouldIncludeHeaders: boolean,
): RequestOutput =>
  isErr(result)
    ? formatErrorOutput(result.error)
    : formatResponseOutput(result.value, shouldIncludeHeaders);

const formatErrorOutput = (error: RequestError): RequestOutput =>
  match(error)
    .with({ kind: "missing-env-id" }, () =>
      failed(
        "missing-env-id",
        "No environment ID. Pass --envId <id>, or set a default with `kontent environment use <id>`.",
      ),
    )
    .with({ kind: "auth-failed" }, ({ error: authError }) =>
      failed(
        `auth:${authError.kind}`,
        authError.kind === "not-logged-in"
          ? "No Management API credential found. Run `kontent login`, or pass --mapiKey <key>, send an Authorization header, or set KONTENT_MAPI_KEY."
          : formatAuthError(authError),
      ),
    )
    .with({ kind: "invalid-endpoint" }, { kind: "transport" }, (e) =>
      failed(e.kind, e.message, { "auth-source": e.authSource }),
    )
    .with(
      { kind: "invalid-method" },
      { kind: "invalid-header" },
      { kind: "unreadable-input" },
      (e) => failed(e.kind, e.message),
    )
    .exhaustive();

const failed = (
  errorCode: string,
  message: string,
  properties?: EventProperties,
): RequestOutput => ({
  stdout: "",
  stderr: [{ level: "error", text: message }],
  isFailure: true,
  telemetry: { outcome: "fail", errorCode, ...(properties === undefined ? {} : { properties }) },
});

const formatResponseOutput = (
  outcome: RequestOutcome,
  shouldIncludeHeaders: boolean,
): RequestOutput => {
  const { response, authSource, env } = outcome;
  const presented = presentResponse(response, shouldIncludeHeaders);
  const isHttpFailure = response.statusCode >= 400;
  const properties = { "status-code": response.statusCode, "auth-source": authSource };

  const stderr: ReadonlyArray<StderrLine> = [
    ...(presented.droppedBodyWarning === undefined
      ? []
      : [{ level: "warning" as const, text: presented.droppedBodyWarning }]),
    ...(presented.payload === "" && !isHttpFailure
      ? [{ level: "info" as const, text: `HTTP ${response.statusCode}` }]
      : []),
    ...(isHttpFailure
      ? [{ level: "error" as const, text: formatFailure(response, authSource, env) }]
      : []),
  ];

  return {
    stdout: presented.payload,
    stderr,
    isFailure: isHttpFailure,
    telemetry: isHttpFailure
      ? { outcome: "fail", errorCode: `http-${response.statusCode}`, properties }
      : { outcome: "succeed", properties },
  };
};

const formatFailure = (
  response: MapiResponse,
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
