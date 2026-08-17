import { showTelemetryStatus } from "../../core/telemetry/settings.js";
import { createLoggerFromArgs } from "../../log.js";
import type { RegisterCommand } from "../../types/yargs.js";

export const register: RegisterCommand = (sub) =>
  sub.command({
    command: "status",
    describe: "Show whether telemetry is enabled and why",
    builder: (b) => b,
    handler: async (args) => showTelemetryStatus(createLoggerFromArgs(args)),
  });
