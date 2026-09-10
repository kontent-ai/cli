import { getObjectDetails } from "../../../core/docs/learn.js";
import { API_REFERENCES } from "../../../lib/learn/apiReference.js";
import type { RegisterCommand } from "../../../types/yargs.js";
import { withCompactOption, withLimitOption } from "../cliOptions.js";
import { runDocsCommand } from "../runDocsCommand.js";

export const register: RegisterCommand = (sub, deps) =>
  sub.command({
    command: "object <query>",
    describe: "Show matching API reference objects and their properties",
    builder: (b) =>
      withCompactOption(
        withLimitOption(
          b.positional("query", {
            type: "string",
            demandOption: true,
            describe: "The object to look up, in plain language",
          }),
          1,
        ),
      )
        .option("api", {
          type: "string",
          choices: [...API_REFERENCES],
          default: "content_management_api_v2",
          describe: "API reference to search",
        } as const)
        .example("$0 docs object 'language variant'", "List the properties of an API object")
        .example(
          "$0 docs object 'text element' --api delivery_api",
          "Describe the element as the Delivery API returns it",
        ),
    handler: async (args) =>
      await runDocsCommand("docs object", args, deps.telemetry, async (docsDeps) =>
        getObjectDetails(
          { query: args.query, limit: args.limit, apiReference: args.api },
          docsDeps,
        ),
      ),
  });
