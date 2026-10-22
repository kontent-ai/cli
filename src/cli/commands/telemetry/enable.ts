import type { RegisterCommand } from "../../types/yargs.js";

export const register: RegisterCommand = (sub) =>
  sub.command({
    command: "enable",
    describe: "Enable anonymous usage telemetry",
    builder: (b) => b,
    handler: async (args) => {
      const { runSetTelemetry } = await import("./runTelemetry.js");
      await runSetTelemetry(args, true);
    },
  });
