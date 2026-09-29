import { readCliConfig, writeCliConfig } from "../../lib/config/cliConfig.js";
import { isErr } from "../../lib/result.js";
import { createLoggerFromArgs } from "../../log.js";
import type { RegisterCommand } from "../../types/yargs.js";

export const register: RegisterCommand = (sub) =>
  sub.command({
    command: "clear",
    describe: "Remove the default environment, making --envId required again",
    builder: (b) => b,
    handler: async (args) => {
      const logger = createLoggerFromArgs(args);

      const { envId } = await readCliConfig();
      if (envId === undefined) {
        logger.info("standard", "No default environment was set.");
        return;
      }

      const written = await writeCliConfig({ envId: undefined });
      if (isErr(written)) {
        logger.error(`Failed to update the config: ${written.error}`);
        process.exitCode = 1;
        return;
      }

      logger.info("standard", "Default environment cleared.");
    },
  });
