import type { Argv } from "yargs";
import type { LogOptions } from "../../../log.js";
import type { RegisterCommand } from "../../../types/yargs.js";

export const requestCommand = {
  command: "$0 <endpoint>",
  describe: "Send a request to the Delivery API",
  builder: <T extends LogOptions>(b: Argv<T>) =>
    b
      // `<endpoint>` only makes it required at runtime; demandOption narrows the type.
      .positional("endpoint", {
        type: "string",
        demandOption: true,
        describe:
          'Delivery API path relative to the environment, e.g. "items" or "types/article", not "<environment_id>/items".\nThe environment comes from --envId or the default set by `kontent environment use`.',
      })
      .option("envId", {
        type: "string",
        describe:
          "Environment ID (Guid). Falls back to the default set by `kontent environment use`",
      })
      .option("preview", {
        type: "boolean",
        default: false,
        describe:
          "Use the Delivery Preview API for the latest, unpublished content. Needs a key with Content preview access",
      })
      .option("dapiKey", {
        type: "string",
        describe:
          "Delivery API key, needed for preview and for environments with secure access. Visible in shell history and the process list; prefer the KONTENT_DAPI_KEY environment variable",
      })
      .option("header", {
        type: "string",
        array: true,
        alias: "H",
        describe:
          'Request header in the "Name: value" format. Repeatable. An Authorization header takes precedence over --dapiKey and KONTENT_DAPI_KEY',
      })
      // Without nargs the array is greedy, so `-H 'X-Foo: 1' items` swallows the
      // endpoint and yargs then reports it as a missing positional.
      .nargs("header", 1)
      .option("include", {
        type: "boolean",
        alias: "i",
        default: false,
        describe: "Print the status line and response headers before the body",
      })
      .option("waitForNewContent", {
        type: "boolean",
        default: false,
        describe:
          "Wait for the latest content instead of a cached copy; use it right after changing content",
      })
      .option("paginate", {
        type: "boolean",
        default: false,
        describe:
          "Fetch every page and print each as it arrives, one JSON document per page. Use --slurp for a single array",
      })
      .option("slurp", {
        type: "boolean",
        default: false,
        describe: "With --paginate, print all pages as one JSON array",
      })
      .option("maxPages", {
        type: "number",
        describe: "With --paginate, stop after this many pages",
      })
      // A query string needs quoting: "?" is a glob character in zsh and bash.
      .example("$0 dapi 'items?limit=10' --envId <id>", "List the first 10 published content items")
      .example("$0 dapi items/my_article --preview", "Get the latest version of an item")
      .example(
        "$0 dapi items-feed --paginate | jq '.items[].system.codename'",
        "Print the codename of every item",
      )
      .example(
        "$0 dapi 'items?system.type=article' --paginate --slurp > articles.json",
        "Save every article as one JSON array",
      )
      .example("$0 dapi items/my_article/used-in", "List published items that reference an item")
      .example("$0 dapi assets/my_image/used-in", "List published items that reference an asset")
      .example(
        "read -rs KONTENT_DAPI_KEY && export KONTENT_DAPI_KEY",
        "Set the key without echoing it or writing it to shell history",
      )
      .check((args) => (args.envId?.trim() === "" ? "--envId must not be empty." : true))
      .check((args) => (args.dapiKey?.trim() === "" ? "--dapiKey must not be empty." : true))
      .check((args) =>
        args.maxPages === undefined || (Number.isInteger(args.maxPages) && args.maxPages >= 1)
          ? true
          : "--maxPages must be a whole number of at least 1.",
      )
      .check((args) =>
        args.maxPages !== undefined && !args.paginate ? "--maxPages requires --paginate." : true,
      )
      .check((args) => (args.slurp && !args.paginate ? "--slurp requires --paginate." : true))
      .check((args) =>
        args.include && args.paginate ? "--include cannot be combined with --paginate." : true,
      )
      .epilogue(
        "Use `kontent dapi` to read content as a website gets it: filtered, ordered, with linked items,\n" +
          "CDN-cached and with higher rate limits than the Management API. Use --preview for unpublished changes.\n" +
          "Use `kontent mapi` instead to change anything, or to read what the Delivery API doesn't expose.\n\n" +
          "Not sure which endpoint or filter to use? Look it up first:\n" +
          '  kontent docs search "filter content items"                       find the right page\n' +
          '  kontent docs endpoint "list content items" --api delivery_api     URL, parameters, filters\n' +
          '  kontent docs object "content item" --api delivery_api             object properties',
      ),
};

export const register: RegisterCommand = (sub, deps) =>
  sub.command({
    command: requestCommand.command,
    describe: requestCommand.describe,
    builder: (b) => requestCommand.builder(b),
    handler: async (args) => {
      const { runRequest } = await import("./runRequest.js");
      await runRequest(args, deps);
    },
  });
