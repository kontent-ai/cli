import type { RegisterCommand } from "../../types/yargs.js";
import { runCommand } from "../shared/runCommand.js";

export const register: RegisterCommand = (sub, deps) =>
  sub.command({
    command: "current",
    describe: "Print the default environment ID",
    builder: (b) => b,
    handler: async (args) =>
      runCommand({ trackAs: null, args, deps }, async (logger) => {
        const { runCurrent } = await import("./runEnvironment.js");
        return runCurrent(deps, logger);
      }),
  });
