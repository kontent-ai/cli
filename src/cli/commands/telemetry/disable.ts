import type { RegisterCommand } from "../../types/yargs.js";
import { runCommand } from "../shared/runCommand.js";

export const register: RegisterCommand = (sub, deps) =>
  sub.command({
    command: "disable",
    describe: "Disable anonymous usage telemetry",
    builder: (b) => b,
    handler: async (args) =>
      runCommand({ trackAs: null, args, deps }, async (logger) => {
        const { runSetTelemetry } = await import("./runTelemetry.js");
        return runSetTelemetry(deps, logger, false);
      }),
  });
