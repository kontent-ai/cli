import { invalidEnvIdMessage } from "../../core/environment/envId.js";
import { isGuid } from "../../lib/guid.js";
import type { RegisterCommand } from "../../types/yargs.js";

export const register: RegisterCommand = (sub) =>
  sub.command({
    command: "use <envId>",
    describe: "Set the default environment used when --envId is omitted",
    builder: (b) =>
      b
        .positional("envId", {
          type: "string",
          demandOption: true,
          describe: "Environment ID (Guid)",
        })
        // Checked here too, so a malformed id is reported before any credential lookup.
        .check((args) => (isGuid(args.envId.trim()) ? true : invalidEnvIdMessage(args.envId))),
    handler: async (args) => {
      const { runUse } = await import("./runUse.js");
      await runUse(args);
    },
  });
