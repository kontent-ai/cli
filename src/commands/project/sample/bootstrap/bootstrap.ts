import { createLoggerFromArgs } from "../../../../log.js";
import type { RegisterCommand } from "../../../../types/yargs.js";

export const register: RegisterCommand = (sub, deps) =>
  sub.command({
    command: "bootstrap",
    describe: "Clone a sample app for an environment and wire its .env",
    builder: (b) =>
      b
        .option("envId", {
          type: "string",
          demandOption: true,
          describe: "Environment ID (Guid)",
        })
        .option("path", {
          type: "string",
          default: "./karma-nextjs-app",
          describe: "Target directory for the cloned app (must be empty or non-existent)",
        }),
    handler: async (args) => {
      const { runBootstrap } = await import("./runBootstrap.js");
      await runBootstrap(args, createLoggerFromArgs(args), deps.telemetry);
    },
  });
