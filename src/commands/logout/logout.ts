import { performLogout } from "../../core/logout/logout.js";
import { formatAuthError } from "../../lib/auth/formatAuthError.js";
import { isErr } from "../../lib/result.js";
import { createLoggerFromArgs } from "../../log.js";
import type { RegisterCommand } from "../../types/yargs.js";

export const register: RegisterCommand = (y, deps) =>
  y.command({
    command: "logout",
    describe: "Clear stored authentication tokens",
    builder: (b) => b,
    handler: async (args) => {
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
    },
  });
