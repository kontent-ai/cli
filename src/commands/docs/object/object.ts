import { getObjectDetails } from "../../../core/docs/learn.js";
import type { RegisterCommand } from "../../../types/yargs.js";
import { withDocsOptions } from "../cliOptions.js";
import { runDocsCommand } from "../runDocsCommand.js";

export const register: RegisterCommand = (sub, deps) =>
  sub.command({
    command: "object <query>",
    describe: "Show matching API reference objects and their properties",
    builder: (b) =>
      withDocsOptions(
        b.positional("query", {
          type: "string",
          demandOption: true,
          describe: "The object to look up, in plain language",
        }),
        { defaultLimit: 1, isApiRequired: true },
      )
        .example(
          "$0 docs object 'language variant' --api content_management_api_v2",
          "List the properties of an API object",
        )
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
