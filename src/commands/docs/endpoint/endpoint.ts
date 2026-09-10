import { getEndpointDetails } from "../../../core/docs/learn.js";
import { API_REFERENCES } from "../../../lib/learn/apiReference.js";
import type { RegisterCommand } from "../../../types/yargs.js";
import { withLimitOption } from "../limitOption.js";
import { runDocsCommand } from "../runDocsCommand.js";

export const register: RegisterCommand = (sub, deps) =>
  sub.command({
    command: "endpoint <query>",
    describe: "Show matching API endpoints: method, URL, parameters, responses, code samples",
    builder: (b) =>
      withLimitOption(
        b.positional("query", {
          type: "string",
          demandOption: true,
          describe: "The operation to look up, in plain language",
        }),
        1,
      )
        .option("api", {
          type: "string",
          choices: [...API_REFERENCES],
          describe: "Restrict results to one API reference",
        } as const)
        .example(
          "$0 docs endpoint 'upsert language variant'",
          "Show how to call the upsert endpoint",
        )
        .example(
          "$0 docs endpoint 'add a content type' --limit 3",
          "Compare the three best-scoring endpoints",
        ),
    handler: async (args) =>
      await runDocsCommand("docs endpoint", args, deps.telemetry, async (docsDeps) =>
        getEndpointDetails(
          { query: args.query, limit: args.limit, apiReference: args.api },
          docsDeps,
        ),
      ),
  });
