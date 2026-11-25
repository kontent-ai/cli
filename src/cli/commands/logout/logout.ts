import type { RegisterCommand } from "../../types/yargs.js";
import { runCommand } from "../shared/runCommand.js";

export const register: RegisterCommand = (y, deps) =>
  y.command({
    command: "logout",
    describe: "Clear stored authentication tokens",
    builder: (b) => b,
    handler: async (args) =>
      runCommand({ trackAs: "logout", args, deps }, async (logger) => {
        const { runLogout } = await import("./runLogout.js");
        return runLogout(logger);
      }),
  });
