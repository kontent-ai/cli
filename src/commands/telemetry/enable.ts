import { setTelemetryStatus } from "../../core/telemetry/settings.js";
import type { RegisterCommand } from "../../types/yargs.js";

export const register: RegisterCommand = (sub) =>
  sub.command({
    command: "enable",
    describe: "Enable anonymous usage telemetry",
    builder: (b) => b,
    handler: async (args) => setTelemetryStatus(args, true),
  });
