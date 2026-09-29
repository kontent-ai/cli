import { readCliConfig } from "../../lib/config/cliConfig.js";
import { createLoggerFromArgs } from "../../log.js";
import type { RegisterCommand } from "../../types/yargs.js";

export const register: RegisterCommand = (sub) =>
  sub.command({
    command: "current",
    describe: "Print the default environment ID",
    builder: (b) => b,
    handler: async (args) => {
      const { envId } = await readCliConfig();
      if (envId === undefined) {
        createLoggerFromArgs(args).error(
          "No default environment is set. Run `kontent environment use <envId>`.",
        );
        process.exitCode = 1;
        return;
      }
      process.stdout.write(`${envId}\n`);
    },
  });
