import type { RegisterCommand } from "../../types/yargs.js";
import { runCommand } from "../shared/runCommand.js";

export const register: RegisterCommand = (sub, deps) =>
  sub.command({
    command: "clear",
    describe: "Remove the default environment, making --envId required again",
    builder: (b) => b,
    handler: async (args) =>
      runCommand({ trackAs: null, args, deps }, async (logger) => {
        const { runClear } = await import("./runEnvironment.js");
        return runClear(logger);
      }),
  });
