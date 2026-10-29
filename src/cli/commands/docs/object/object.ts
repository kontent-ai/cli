import type { Argv } from "yargs";
import type { LogOptions } from "../../../log.js";
import type { RegisterCommand } from "../../../types/yargs.js";
import { withDocsOptions } from "../cliOptions.js";

export const objectCommand = {
  command: "object <query>",
  describe: "Show matching API reference objects and their properties",
  builder: <T extends LogOptions>(b: Argv<T>) =>
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
};

export const register: RegisterCommand = (sub, deps) =>
  sub.command({
    command: objectCommand.command,
    describe: objectCommand.describe,
    builder: (b) => objectCommand.builder(b),
    handler: async (args) => {
      const { runDocs, getObjectDetails } = await import("../runDocs.js");
      await runDocs("docs object", args, deps.telemetry, async (effects) =>
        getObjectDetails(effects, { query: args.query, limit: args.limit, apiReference: args.api }),
      );
    },
  });
