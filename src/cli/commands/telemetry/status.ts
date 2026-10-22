import type { RegisterCommand } from "../../types/yargs.js";

export const register: RegisterCommand = (sub) =>
  sub.command({
    command: "status",
    describe: "Show whether telemetry is enabled and why",
    builder: (b) => b,
    handler: async () => {
      const { runStatus } = await import("./runTelemetry.js");
      await runStatus();
    },
  });
