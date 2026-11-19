import chalk from "chalk";

import type { RegisterCommand } from "../../types/yargs.js";
import { register as registerSnapshot } from "./snapshot/snapshot.js";

const subcommandsToRegister: ReadonlyArray<RegisterCommand> = [registerSnapshot];

export const register: RegisterCommand = (y, deps) =>
  y.command({
    command: "model",
    describe: "Content model commands",
    builder: (sub) =>
      subcommandsToRegister
        .reduce((current, registerSub) => registerSub(current, deps), sub)
        .demandCommand(1, chalk.red("You need to provide a model subcommand."))
        .strict(),
    handler: () => {
      // parent command is a group; subcommands handle execution
    },
  });
