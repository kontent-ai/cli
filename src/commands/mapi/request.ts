import { createLoggerFromArgs } from "../../log.js";
import type { RegisterCommand } from "../../types/yargs.js";

export const register: RegisterCommand = (sub, deps) =>
  sub.command({
    command: "$0 <endpoint>",
    describe: "Send an authenticated request to the Management API",
    builder: (b) =>
      b
        // `<endpoint>` only makes it required at runtime; demandOption narrows the type.
        .positional("endpoint", {
          type: "string",
          demandOption: true,
          describe:
            'API path under the environment, e.g. "types" or "types/codename/article". The environment ID is prepended for you; a path starting with "projects/" is sent as is',
        })
        .option("envId", {
          type: "string",
          describe:
            "Environment ID (Guid). Falls back to the default set by `kontent environment use`",
        })
        .option("mapiKey", {
          type: "string",
          describe:
            "Management API key. Falls back to the KONTENT_MAPI_KEY environment variable, then to the logged-in user's token",
        })
        .option("method", {
          type: "string",
          alias: "X",
          describe: "HTTP method. (default: GET, or POST with --input)",
        })
        .option("header", {
          type: "string",
          array: true,
          alias: "H",
          describe:
            'Request header in the "Name: value" format. Repeatable. An Authorization header takes precedence over --mapiKey and the stored login token',
        })
        // Without nargs the array is greedy, so `-H 'X-Foo: 1' types` swallows the
        // endpoint and yargs then reports it as a missing positional.
        .nargs("header", 1)
        .option("input", {
          type: "string",
          describe:
            'Path to the request body, or "-" to read stdin. A pipe works too - /dev/stdin or <(cmd). Sent as application/json unless a Content-Type header says otherwise - set one when uploading a binary file, since the Management API stores it as the asset\'s MIME type',
        })
        // Without nargs, yargs-parser reads the lone "-" of `--input -` as a
        // positional and .strict() then rejects it as an unknown argument.
        .nargs("input", 1)
        .option("include", {
          type: "boolean",
          alias: "i",
          default: false,
          describe: "Print the status line and response headers before the body",
        })
        // A query string needs quoting: "?" is a glob character in zsh and bash.
        .example("$0 mapi 'types?limit=10' --envId <id>", "List the first 10 content types")
        .example(
          "$0 mapi types --envId <id> --input body.json",
          "Create a content type from a file (--input implies POST)",
        )
        .example("$0 mapi 'items/<item-id>' -X DELETE --envId <id>", "Delete a content item")
        .example(
          "$0 mapi types -H 'X-Foo: 1' -H 'X-Bar: 2' --envId <id>",
          "Send extra headers (-H is repeatable)",
        )
        .example(
          'echo \'{"name":"Article"}\' | $0 mapi types --envId <id> --input -',
          "Create a content type from a piped body",
        )
        .example("$0 mapi 'types/codename/article' --envId <id>", "Get a content type by codename")
        .check((args) => (args.envId?.trim() === "" ? "--envId must not be empty." : true))
        .epilogue(
          "Not sure which endpoint or payload shape to use? Look it up first:\n" +
            '  kontent docs search "publish a variant"                                           find the right page\n' +
            '  kontent docs endpoint "upsert language variant" --api content_management_api_v2   method, URL, parameters\n' +
            '  kontent docs object "rich text element" --api content_management_api_v2           object properties',
        ),
    handler: async (args) => {
      const { runRequest } = await import("./runRequest.js");
      await runRequest(args, createLoggerFromArgs(args), deps.telemetry);
    },
  });
