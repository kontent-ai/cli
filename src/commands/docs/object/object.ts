import { getObjectDetails } from "../../../core/docs/learn.js";
import { API_REFERENCES } from "../../../lib/learn/apiReference.js";
import type { RegisterCommand } from "../../../types/yargs.js";
import { withLimitOption } from "../limitOption.js";
import { runDocsCommand } from "../runDocsCommand.js";

export const register: RegisterCommand = (sub, deps) =>
  sub.command({
    command: "object <query>",
    describe: "Show matching API reference objects and their properties",
    builder: (b) =>
      withLimitOption(
        b.positional("query", {
          type: "string",
          demandOption: true,
          describe: "The object to look up, in plain language",
        }),
        1,
      )
        .option("api", {
          type: "string",
          choices: [...API_REFERENCES],
          describe: "Restrict results to one API reference",
        } as const)
        .example("$0 docs object 'language variant'", "List the properties of an API object")
        .example(
          "$0 docs object 'text element' --api delivery_api",
          "Restrict the lookup to one API reference",
        ),
    handler: async (args) =>
      await runDocsCommand("docs object", args, deps.telemetry, async (docsDeps) =>
        getObjectDetails(
          { query: args.query, limit: args.limit, apiReference: args.api },
          docsDeps,
        ),
      ),
  });
