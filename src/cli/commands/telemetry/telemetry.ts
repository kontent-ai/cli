import chalk from "chalk";

import type { RegisterCommand } from "../../types/yargs.js";
import { register as registerDisable } from "./disable.js";
import { register as registerEnable } from "./enable.js";
import { register as registerStatus } from "./status.js";

const subcommandsToRegister: ReadonlyArray<RegisterCommand> = [
  registerStatus,
  registerEnable,
  registerDisable,
];

export const register: RegisterCommand = (y, deps) =>
  y.command({
    command: "telemetry",
    describe: "Inspect or change anonymous usage telemetry settings",
    builder: (sub) =>
      subcommandsToRegister
        .reduce((current, registerSub) => registerSub(current, deps), sub)
        .demandCommand(1, chalk.red("You need to provide a telemetry subcommand."))
        .strict(),
    handler: () => {
      // parent command is a group; subcommands handle execution
    },
  });
