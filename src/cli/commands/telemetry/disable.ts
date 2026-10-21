import { createLoggerFromArgs } from "../../log.js";
import type { RegisterCommand } from "../../types/yargs.js";
import { setTelemetryStatus } from "./settings.js";

export const register: RegisterCommand = (sub) =>
  sub.command({
    command: "disable",
    describe: "Disable anonymous usage telemetry",
    builder: (b) => b,
    handler: async (args) => setTelemetryStatus(createLoggerFromArgs(args), false),
  });
