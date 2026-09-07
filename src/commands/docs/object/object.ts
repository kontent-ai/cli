import { getObjectDetails } from "../../../core/docs/learn.js";
import type { RegisterCommand } from "../../../types/yargs.js";
import { runDocsCommand } from "../runDocsCommand.js";

export const register: RegisterCommand = (sub, deps) =>
  sub.command({
    command: "object <query>",
    describe: "Show the best-matching API reference object and its properties",
    builder: (b) =>
      b
        .positional("query", {
          type: "string",
          demandOption: true,
          describe: "The object to look up, in plain language",
        })
        .example("$0 docs object 'language variant'", "List the properties of an API object"),
    handler: async (args) =>
      await runDocsCommand("docs object", args, deps.telemetry, async (docsDeps) =>
        getObjectDetails({ query: args.query }, docsDeps),
      ),
  });
