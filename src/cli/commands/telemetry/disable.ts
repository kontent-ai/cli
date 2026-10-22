import type { RegisterCommand } from "../../types/yargs.js";

export const register: RegisterCommand = (sub) =>
  sub.command({
    command: "disable",
    describe: "Disable anonymous usage telemetry",
    builder: (b) => b,
    handler: async (args) => {
      const { runSetTelemetry } = await import("./runTelemetry.js");
      await runSetTelemetry(args, false);
    },
  });
