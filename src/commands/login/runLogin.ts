import { type LoginOutcome, performLogin } from "../../core/login/login.js";
import { formatAuthError } from "../../lib/auth/formatAuthError.js";
import { isErr } from "../../lib/result.js";
import { createLoggerFromArgs, type LogOptions } from "../../log.js";
import type { CommandDeps } from "../../types/yargs.js";

export const runLogin = async (args: LogOptions, deps: CommandDeps): Promise<void> => {
  const logger = createLoggerFromArgs(args);
  const tracker = deps.telemetry.startCommandTracking("login", logger);

  const result = await performLogin(logger);
  if (isErr(result)) {
    tracker.fail(result.error.kind);
    logger.error(formatAuthError(result.error));
    process.exitCode = 1;
    return;
  }
  tracker.succeed();
  logger.info("standard", formatLoginOutcome(result.value));
};

const formatLoginOutcome = (outcome: LoginOutcome): string => {
  const base = outcome.isAlreadyAuthenticated ? "Already authenticated" : "Logged in";
  return outcome.identifier === null ? base : `${base} as ${outcome.identifier}`;
};
