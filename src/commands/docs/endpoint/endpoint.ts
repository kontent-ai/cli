import { getEndpointDetails } from "../../../core/docs/learn.js";
import type { RegisterCommand } from "../../../types/yargs.js";
import { runDocsCommand } from "../runDocsCommand.js";

export const register: RegisterCommand = (sub, deps) =>
  sub.command({
    command: "endpoint <query>",
    describe:
      "Show the best-matching API endpoint: method, URL, parameters, responses, code samples",
    builder: (b) =>
      b
        .positional("query", {
          type: "string",
          demandOption: true,
          describe: "The operation to look up, in plain language",
        })
        .example(
          "$0 docs endpoint 'upsert language variant'",
          "Show how to call the upsert endpoint",
        ),
    handler: async (args) =>
      await runDocsCommand("docs endpoint", args, deps.telemetry, async (docsDeps) =>
        getEndpointDetails({ query: args.query }, docsDeps),
      ),
  });
