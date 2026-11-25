import { match } from "ts-pattern";
import { isSessionRejected } from "../../../core/auth/session.js";
import type { PassthroughResponse } from "../../../core/passthrough/response.js";
import type { EventProperties } from "../../../core/telemetry/events.js";
import type { Logger } from "../../log.js";
import { type CommandOutcome, failureOutcome } from "./commandOutcome.js";
import { presentResponse } from "./presentResponse.js";
import { sessionExpiredMessage } from "./sessionExpired.js";

export type StderrLine = Readonly<{ level: "info" | "warning" | "error"; text: string }>;

/** Everything a passthrough command writes, decided as data so the streams can be asserted on. */
export type PassthroughOutput = Readonly<{
  stdout: string;
  stderr: ReadonlyArray<StderrLine>;
  outcome: CommandOutcome;
}>;

export const failedOutput = (message: string, outcome: CommandOutcome): PassthroughOutput => ({
  stdout: "",
  stderr: [{ level: "error", text: message }],
  outcome,
});

export const MISSING_ENV_ID_OUTPUT: PassthroughOutput = failedOutput(
  "No environment ID. Pass --envId <id>, or set a default with `kontent environment use <id>`.",
  failureOutcome("missing-env-id"),
);

export const formatResponseOutput = (
  response: PassthroughResponse,
  params: Readonly<{
    shouldIncludeHeaders: boolean;
    properties: EventProperties;
    isLoginToken: boolean;
    describeFailure: (response: PassthroughResponse) => string;
  }>,
): PassthroughOutput => {
  const presented = presentResponse(response, params.shouldIncludeHeaders);
  const isHttpFailure = response.statusCode >= 400;
  const isLoginRequired = isSessionRejected({
    status: response.statusCode,
    isLoginToken: params.isLoginToken,
  });
  const properties = { "status-code": response.statusCode, ...params.properties };

  const stderr: ReadonlyArray<StderrLine> = [
    ...(presented.droppedBodyWarning === undefined
      ? []
      : [{ level: "warning" as const, text: presented.droppedBodyWarning }]),
    ...(presented.payload === "" && !isHttpFailure
      ? [{ level: "info" as const, text: `HTTP ${response.statusCode}` }]
      : []),
    ...(isHttpFailure
      ? [
          {
            level: "error" as const,
            text: isLoginRequired
              ? `HTTP ${response.statusCode}\n${sessionExpiredMessage}`
              : params.describeFailure(response),
          },
        ]
      : []),
  ];

  return {
    stdout: presented.payload,
    stderr,
    outcome: isHttpFailure
      ? {
          status: "error",
          reason: isLoginRequired ? "auth-required" : "failure",
          errorCode: `http-${response.statusCode}`,
          properties,
        }
      : { status: "success", properties },
  };
};

export const emitPassthroughOutput = (
  output: PassthroughOutput,
  logger: Logger,
): CommandOutcome => {
  if (output.stdout !== "") {
    process.stdout.write(output.stdout);
  }
  for (const line of output.stderr) {
    match(line)
      .with({ level: "info" }, ({ text }) => logger.info("standard", text))
      .with({ level: "warning" }, ({ text }) => logger.warning("standard", text))
      .with({ level: "error" }, ({ text }) => logger.error(text))
      .exhaustive();
  }
  return output.outcome;
};
