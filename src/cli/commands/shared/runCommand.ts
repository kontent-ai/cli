import { match } from "ts-pattern";
import { errorMessage } from "../../../core/lib/error.js";
import { EXIT_CODES } from "../../../core/lib/exitCodes.js";
import type { CommandTracker } from "../../adapters/telemetry/tracking.js";
import { createLoggerFromArgs, type Logger, type LogOptions } from "../../log.js";
import type { CommandDeps } from "../../types/yargs.js";
import { type CommandOutcome, createFailureOutcome } from "./commandOutcome.js";

type RunCommandParams = Readonly<{
  trackAs: string | null;
  args: LogOptions;
  deps: CommandDeps;
}>;

// A throw is tracked only as `unexpected`: its message and stack stay in the terminal.
export const runCommand = async (
  params: RunCommandParams,
  run: (logger: Logger) => Promise<CommandOutcome>,
): Promise<void> => {
  const logger = createLoggerFromArgs(params.args);
  const tracker = startTracking(params, logger);
  const outcome = await run(logger).catch((error: unknown): CommandOutcome => {
    logger.error(formatUnexpectedError(error, logger.isVerbose));
    return createFailureOutcome("unexpected");
  });
  recordOutcome(tracker, outcome);
  process.exitCode = outcome.status === "success" ? EXIT_CODES.success : EXIT_CODES[outcome.reason];
};

export const summarizeUnexpectedError = (error: unknown): string => {
  const summary = `Unexpected error: ${errorMessage(error)}`;
  return /[.!?]$/.test(summary) ? summary : `${summary}.`;
};

const startTracking = (params: RunCommandParams, logger: Logger): CommandTracker | null =>
  params.trackAs === null
    ? null
    : params.deps.telemetry.startCommandTracking(params.trackAs, logger);

// The --verbose hint only where --verbose has a stack to show.
const formatUnexpectedError = (error: unknown, isVerbose: boolean): string => {
  const summary = summarizeUnexpectedError(error);
  const stack = error instanceof Error ? error.stack : undefined;
  if (stack === undefined) {
    return summary;
  }
  return isVerbose ? `${summary}\n${stack}` : `${summary} Run again with --verbose for details.`;
};

const recordOutcome = (tracker: CommandTracker | null, outcome: CommandOutcome): void => {
  if (tracker === null) {
    return;
  }
  match(outcome)
    .with({ status: "success" }, ({ properties }) => tracker.succeed(properties))
    .with({ status: "error" }, ({ errorCode, properties }) => tracker.fail(errorCode, properties))
    .exhaustive();
};
