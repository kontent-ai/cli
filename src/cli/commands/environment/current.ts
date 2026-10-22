import type { RegisterCommand } from "../../types/yargs.js";

export const register: RegisterCommand = (sub) =>
  sub.command({
    command: "current",
    describe: "Print the default environment ID",
    builder: (b) => b,
    handler: async (args) => {
      const { runCurrent } = await import("./runEnvironment.js");
      await runCurrent(args);
    },
  });
