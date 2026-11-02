import { match } from "ts-pattern";
import type { PassthroughResponse } from "../../../core/passthrough/response.js";
import type { EventProperties } from "../../../core/telemetry/events.js";
import type { CommandTracker } from "../../adapters/telemetry/tracking.js";
import type { Logger } from "../../log.js";
import { presentResponse } from "./presentResponse.js";

export type StderrLine = Readonly<{ level: "info" | "warning" | "error"; text: string }>;

/** Everything a passthrough command writes, decided as data so the streams can be asserted on. */
export type PassthroughOutput = Readonly<{
  stdout: string;
  stderr: ReadonlyArray<StderrLine>;
  isFailure: boolean;
  telemetry:
    | Readonly<{ outcome: "succeed"; properties: EventProperties }>
    | Readonly<{ outcome: "fail"; errorCode: string; properties?: EventProperties }>;
}>;

export const failedOutput = (
  errorCode: string,
  message: string,
  properties?: EventProperties,
): PassthroughOutput => ({
  stdout: "",
  stderr: [{ level: "error", text: message }],
  isFailure: true,
  telemetry: { outcome: "fail", errorCode, ...(properties === undefined ? {} : { properties }) },
});

export const MISSING_ENV_ID_OUTPUT: PassthroughOutput = failedOutput(
  "missing-env-id",
  "No environment ID. Pass --envId <id>, or set a default with `kontent environment use <id>`.",
);

export const formatResponseOutput = (
  response: PassthroughResponse,
  params: Readonly<{
    shouldIncludeHeaders: boolean;
    properties: EventProperties;
    describeFailure: (response: PassthroughResponse) => string;
  }>,
): PassthroughOutput => {
  const presented = presentResponse(response, params.shouldIncludeHeaders);
  const isHttpFailure = response.statusCode >= 400;
  const properties = { "status-code": response.statusCode, ...params.properties };

  const stderr: ReadonlyArray<StderrLine> = [
    ...(presented.droppedBodyWarning === undefined
      ? []
      : [{ level: "warning" as const, text: presented.droppedBodyWarning }]),
    ...(presented.payload === "" && !isHttpFailure
      ? [{ level: "info" as const, text: `HTTP ${response.statusCode}` }]
      : []),
    ...(isHttpFailure ? [{ level: "error" as const, text: params.describeFailure(response) }] : []),
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

export const emitPassthroughOutput = (
  output: PassthroughOutput,
  logger: Logger,
  tracker: CommandTracker,
): void => {
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
  match(output.telemetry)
    .with({ outcome: "succeed" }, ({ properties }) => tracker.succeed(properties))
    .with({ outcome: "fail" }, ({ errorCode, properties }) => tracker.fail(errorCode, properties))
    .exhaustive();
  if (output.isFailure) {
    process.exitCode = 1;
  }
};
