import type { RegisterCommand } from "../types/yargs.js";
import { register as registerLogin } from "./login/login.js";
import { register as registerLogout } from "./logout/logout.js";
import { register as registerMapi } from "./mapi/mapi.js";
import { register as registerProject } from "./project/project.js";
import { register as registerTelemetry } from "./telemetry/telemetry.js";

export const commandsToRegister: ReadonlyArray<RegisterCommand> = [
  registerLogin,
  registerLogout,
  registerMapi,
  registerProject,
  registerTelemetry,
];
