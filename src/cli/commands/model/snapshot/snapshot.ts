import type { Argv } from "yargs";
import type { LogOptions } from "../../../log.js";
import type { RegisterCommand } from "../../../types/yargs.js";

const defaultSnapshotPath = "./model-snapshot";

export const snapshotCommand = {
  command: "snapshot",
  describe: "Save the environment's content model as JSON files, one per entity",
  builder: <T extends LogOptions>(b: Argv<T>) =>
    b
      .option("path", {
        type: "string",
        default: defaultSnapshotPath,
        describe:
          "Folder for the snapshot. Created when missing; otherwise it must be empty or hold a previous snapshot",
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
      .example("$0 model snapshot", `Snapshot the default environment into ${defaultSnapshotPath}`)
      .example(
        "$0 model snapshot --envId <id> --path content-model",
        "Snapshot an environment into a folder of your choice",
      )
      .check((args) => (args.path.trim() === "" ? "--path must not be empty." : true))
      .check((args) => (args.envId?.trim() === "" ? "--envId must not be empty." : true))
      .check((args) => (args.mapiKey?.trim() === "" ? "--mapiKey must not be empty." : true)),
};

export const register: RegisterCommand = (sub, deps) =>
  sub.command({
    command: snapshotCommand.command,
    describe: snapshotCommand.describe,
    builder: (b) => snapshotCommand.builder(b),
    handler: async (args) => {
      const { runSnapshot } = await import("./runSnapshot.js");
      await runSnapshot(args, deps);
    },
  });
