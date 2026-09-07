import type { RegisterCommand } from "../types/yargs.js";
import { register as registerDocs } from "./docs/docs.js";
import { register as registerLogin } from "./login/login.js";
import { register as registerLogout } from "./logout/logout.js";
import { register as registerMapi } from "./mapi/mapi.js";
import { register as registerProject } from "./project/project.js";
import { register as registerTelemetry } from "./telemetry/telemetry.js";

export const commandsToRegister: ReadonlyArray<RegisterCommand> = [
  registerDocs,
  registerLogin,
  registerLogout,
  registerMapi,
  registerProject,
  registerTelemetry,
];
