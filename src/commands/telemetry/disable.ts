import { setTelemetryStatus } from "../../core/telemetry/settings.js";
import { createLoggerFromArgs } from "../../log.js";
import type { RegisterCommand } from "../../types/yargs.js";

export const register: RegisterCommand = (sub) =>
  sub.command({
    command: "disable",
    describe: "Disable anonymous usage telemetry",
    builder: (b) => b,
    handler: async (args) => setTelemetryStatus(createLoggerFromArgs(args), false),
  });
