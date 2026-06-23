import chalk from "chalk";

import type { RegisterCommand } from "../../types/yargs.js";
import { register as registerSample } from "./sample/sample.js";

const subcommandsToRegister: ReadonlyArray<RegisterCommand> = [registerSample];

export const register: RegisterCommand = (y, deps) =>
  y.command({
    command: "project",
    describe: "Project-related commands",
    builder: (sub) =>
      subcommandsToRegister
        .reduce((current, registerSub) => registerSub(current, deps), sub)
        .demandCommand(1, chalk.red("You need to provide a project subcommand."))
        .strict(),
    handler: () => {
      // parent command is a group; subcommands handle execution
    },
  });
