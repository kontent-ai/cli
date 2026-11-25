import type { RegisterCommand } from "../../types/yargs.js";
import { runCommand } from "../shared/runCommand.js";

export const register: RegisterCommand = (sub, deps) =>
  sub.command({
    command: "status",
    describe: "Show whether telemetry is enabled and why",
    builder: (b) => b,
    handler: async (args) =>
      runCommand({ trackAs: null, args, deps }, async () => {
        const { runStatus } = await import("./runTelemetry.js");
        return runStatus(deps);
      }),
  });
