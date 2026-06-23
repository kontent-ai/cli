import { performLogout } from "../../core/logout/logout.js";
import { formatAuthError } from "../../lib/auth/formatAuthError.js";
import { isErr } from "../../lib/result.js";
import { logError, logInfo } from "../../log.js";
import type { RegisterCommand } from "../../types/yargs.js";

export const register: RegisterCommand = (y, deps) =>
  y.command({
    command: "logout",
    describe: "Clear stored authentication tokens",
    builder: (b) => b,
    handler: async (args) => {
      const tracker = deps.telemetry.startCommandTracking("logout", args);

      const result = await performLogout(args);
      if (isErr(result)) {
        tracker.fail(result.error.kind);
        logError(args, formatAuthError(result.error));
        process.exitCode = 1;
        return;
      }
      tracker.succeed();
      logInfo(args, "standard", "Logged out.");
    },
  });
