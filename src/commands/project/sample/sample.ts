import chalk from "chalk";

import type { RegisterCommand } from "../../../types/yargs.js";
import { register as registerBootstrap } from "./bootstrap.js";

const subcommandsToRegister: ReadonlyArray<RegisterCommand> = [registerBootstrap];

export const register: RegisterCommand = (y, deps) =>
  y.command({
    command: "sample",
    describe: "Sample app commands",
    builder: (sub) =>
      subcommandsToRegister
        .reduce((current, registerSub) => registerSub(current, deps), sub)
        .demandCommand(1, chalk.red("You need to provide a sample subcommand."))
        .strict(),
    handler: () => {
      // parent command is a group; subcommands handle execution
    },
  });
