import { isErr } from "../../../core/lib/result.js";
import { createLoggerFromArgs, type LogOptions } from "../../log.js";
import type { CommandDeps } from "../../types/yargs.js";
import { formatAuthError } from "../shared/formatAuthError.js";
import { performLogout } from "./performLogout.js";

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
