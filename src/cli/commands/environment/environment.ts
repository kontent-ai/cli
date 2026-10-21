import chalk from "chalk";

import type { RegisterCommand } from "../../types/yargs.js";
import { register as registerClear } from "./clear.js";
import { register as registerCurrent } from "./current.js";
import { register as registerUse } from "./use.js";

const subcommandsToRegister: ReadonlyArray<RegisterCommand> = [
  registerUse,
  registerCurrent,
  registerClear,
];

export const register: RegisterCommand = (y, deps) =>
  y.command({
    command: "environment",
    describe: "Manage the default environment used when --envId is omitted",
    builder: (sub) =>
      subcommandsToRegister
        .reduce((current, registerSub) => registerSub(current, deps), sub)
        .demandCommand(1, chalk.red("You need to provide an environment subcommand."))
        .strict(),
    handler: () => {
      // parent command is a group; subcommands handle execution
    },
  });
