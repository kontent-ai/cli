import type { RegisterCommand } from "../../types/yargs.js";
import { runCommand } from "../shared/runCommand.js";

export const register: RegisterCommand = (y, deps) =>
  y.command({
    command: "login",
    describe: "Authenticate with Kontent.ai via Auth0 device flow",
    builder: (b) => b,
    handler: async (args) =>
      runCommand({ trackAs: "login", args, deps }, async (logger) => {
        const { runLogin } = await import("./runLogin.js");
        return runLogin(deps, logger);
      }),
  });
