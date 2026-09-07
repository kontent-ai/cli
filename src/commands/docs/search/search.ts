import { searchDocs } from "../../../core/docs/learn.js";
import type { RegisterCommand } from "../../../types/yargs.js";
import { runDocsCommand } from "../runDocsCommand.js";

// The service ranks and returns at most this many results; the slice is client-side.
const MAX_LIMIT = 10;

export const register: RegisterCommand = (sub, deps) =>
  sub.command({
    command: "search <query>",
    describe: "Search Kontent.ai Learn docs and API reference, ranked by relevance",
    builder: (b) =>
      b
        // `<query>` only makes it required at runtime; demandOption narrows the type.
        .positional("query", {
          type: "string",
          demandOption: true,
          describe: "What to look for, in plain language",
        })
        .option("limit", {
          type: "number",
          default: MAX_LIMIT,
          describe: `Maximum number of results (1-${MAX_LIMIT})`,
        })
        .check((args) =>
          Number.isInteger(args.limit) && args.limit >= 1 && args.limit <= MAX_LIMIT
            ? true
            : `--limit must be a whole number between 1 and ${MAX_LIMIT}.`,
        )
        .example(
          "$0 docs search 'how to filter by taxonomy'",
          "Find the pages that answer a question",
        )
        .example("$0 docs search 'language variant' --limit 3", "Keep only the three best matches"),
    handler: async (args) =>
      await runDocsCommand("docs search", args, deps.telemetry, async (docsDeps) =>
        searchDocs({ query: args.query, limit: args.limit }, docsDeps),
      ),
  });
