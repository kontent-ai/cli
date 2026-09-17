import chalk from "chalk";

import type { RegisterCommand } from "../../types/yargs.js";
import { register as registerEndpoint } from "./endpoint/endpoint.js";
import { register as registerObject } from "./object/object.js";
import { register as registerSearch } from "./search/search.js";

const subcommandsToRegister: ReadonlyArray<RegisterCommand> = [
  registerSearch,
  registerEndpoint,
  registerObject,
];

export const register: RegisterCommand = (y, deps) =>
  y.command({
    command: "docs",
    describe: "Look up Kontent.ai documentation and API reference",
    builder: (sub) =>
      subcommandsToRegister
        .reduce((current, registerSub) => registerSub(current, deps), sub)
        .demandCommand(1, chalk.red("You need to provide a docs subcommand."))
        .strict()
        .epilogue(
          'Every command prints a JSON array of candidates the service ranked by score; --limit says how many of them to keep.\nRun "kontent docs search" first when unsure which endpoint or object you need.',
        ),
    handler: () => {
      // parent command is a group; subcommands handle execution
    },
  });
