import type { Argv } from "yargs";
import type { LogOptions } from "../../../log.js";
import type { RegisterCommand } from "../../../types/yargs.js";
import { MAX_LIMIT, withDocsOptions } from "../cliOptions.js";

export const searchCommand = {
  command: "search <query>",
  describe: "Search Kontent.ai Learn docs and API reference, ranked by relevance",
  builder: <T extends LogOptions>(b: Argv<T>) =>
    withDocsOptions(
      // `<query>` only makes it required at runtime; demandOption narrows the type.
      b.positional("query", {
        type: "string",
        demandOption: true,
        describe: "What to look for, in plain language",
      }),
      { defaultLimit: MAX_LIMIT, isApiRequired: false },
    )
      .example(
        "$0 docs search 'how to filter by taxonomy'",
        "Find the pages that answer a question",
      )
      .example("$0 docs search 'language variant' --limit 3", "Keep only the three best matches")
      .example(
        "$0 docs search 'content item' --api delivery_api",
        "Keep only Delivery API reference pages, no conceptual guides",
      ),
};

export const register: RegisterCommand = (sub, deps) =>
  sub.command({
    command: searchCommand.command,
    describe: searchCommand.describe,
    builder: (b) => searchCommand.builder(b),
    handler: async (args) => {
      const { runDocs, searchDocs } = await import("../runDocs.js");
      await runDocs("docs search", args, deps.telemetry, async (effects) =>
        searchDocs(effects, { query: args.query, limit: args.limit, apiReference: args.api }),
      );
    },
  });
