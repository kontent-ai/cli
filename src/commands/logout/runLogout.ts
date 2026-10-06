import { performLogout } from "../../core/logout/logout.js";
import { formatAuthError } from "../../lib/auth/formatAuthError.js";
import { isErr } from "../../lib/result.js";
import { createLoggerFromArgs, type LogOptions } from "../../log.js";
import type { CommandDeps } from "../../types/yargs.js";

export const runLogout = async (args: LogOptions, deps: CommandDeps): Promise<void> => {
  const logger = createLoggerFromArgs(args);
  const tracker = deps.telemetry.startCommandTracking("logout", logger);

  const result = await performLogout(logger);
  if (isErr(result)) {
    tracker.fail(result.error.kind);
    logger.error(formatAuthError(result.error));
    process.exitCode = 1;
    return;
  }
  tracker.succeed();
  logger.info("standard", "Logged out.");
};
