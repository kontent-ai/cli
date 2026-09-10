import { searchDocs } from "../../../core/docs/learn.js";
import { API_REFERENCES } from "../../../lib/learn/apiReference.js";
import type { RegisterCommand } from "../../../types/yargs.js";
import { MAX_LIMIT, withLimitOption } from "../limitOption.js";
import { runDocsCommand } from "../runDocsCommand.js";

export const register: RegisterCommand = (sub, deps) =>
  sub.command({
    command: "search <query>",
    describe: "Search Kontent.ai Learn docs and API reference, ranked by relevance",
    builder: (b) =>
      withLimitOption(
        // `<query>` only makes it required at runtime; demandOption narrows the type.
        b.positional("query", {
          type: "string",
          demandOption: true,
          describe: "What to look for, in plain language",
        }),
        MAX_LIMIT,
      )
        .option("api", {
          type: "string",
          choices: [...API_REFERENCES],
          describe:
            "Restrict results to one API reference; conceptual guides are excluded when set",
        } as const)
        .example(
          "$0 docs search 'how to filter by taxonomy'",
          "Find the pages that answer a question",
        )
        .example("$0 docs search 'language variant' --limit 3", "Keep only the three best matches")
        .example(
          "$0 docs search 'webhook' --api delivery_api",
          "Keep only Delivery API reference pages",
        ),
    handler: async (args) =>
      await runDocsCommand("docs search", args, deps.telemetry, async (docsDeps) =>
        searchDocs({ query: args.query, limit: args.limit, apiReference: args.api }, docsDeps),
      ),
  });
