import type { RegisterCommand } from "../../../types/yargs.js";
import { withDocsOptions } from "../cliOptions.js";

export const register: RegisterCommand = (sub, deps) =>
  sub.command({
    command: "endpoint <query>",
    describe: "Show matching API endpoints: method, URL, parameters, responses, code samples",
    builder: (b) =>
      withDocsOptions(
        b.positional("query", {
          type: "string",
          demandOption: true,
          describe: "The operation to look up, in plain language",
        }),
        { defaultLimit: 1, isApiRequired: true },
      )
        .example(
          "$0 docs endpoint 'upsert language variant' --api content_management_api_v2",
          "Show how to call the upsert endpoint",
        )
        .example(
          "$0 docs endpoint 'add a content type' --api content_management_api_v2 --limit 3",
          "Compare the three best-scoring endpoints",
        ),
    handler: async (args) => {
      const { runDocsCommand } = await import("../runDocsCommand.js");
      const { getEndpointDetails } = await import("../../../core/docs/learn.js");
      await runDocsCommand("docs endpoint", args, deps.telemetry, async (docsDeps) =>
        getEndpointDetails(
          { query: args.query, limit: args.limit, apiReference: args.api },
          docsDeps,
        ),
      );
    },
  });
