import type { Argv } from "yargs";
import type { LogOptions } from "../../../log.js";
import type { RegisterCommand } from "../../../types/yargs.js";
import { withDocsOptions } from "../cliOptions.js";

export const endpointCommand = {
  command: "endpoint <query>",
  describe: "Show matching API endpoints: method, URL, parameters, responses, code samples",
  builder: <T extends LogOptions>(b: Argv<T>) =>
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
};

export const register: RegisterCommand = (sub, deps) =>
  sub.command({
    command: endpointCommand.command,
    describe: endpointCommand.describe,
    builder: (b) => endpointCommand.builder(b),
    handler: async (args) => {
      const { runEndpoint } = await import("../runDocs.js");
      await runEndpoint(args, deps);
    },
  });
