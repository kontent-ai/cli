import type { RegisterCommand } from "../../types/yargs.js";
import { buildTelemetryStatusReport } from "./settings.js";

export const register: RegisterCommand = (sub) =>
  sub.command({
    command: "status",
    describe: "Show whether telemetry is enabled and why",
    builder: (b) => b,
    handler: async () => {
      process.stdout.write(`${await buildTelemetryStatusReport()}\n`);
    },
  });
