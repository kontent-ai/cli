import type { RegisterCommand } from "../../types/yargs.js";

export const register: RegisterCommand = (sub) =>
  sub.command({
    command: "clear",
    describe: "Remove the default environment, making --envId required again",
    builder: (b) => b,
    handler: async (args) => {
      const { runClear } = await import("./runEnvironment.js");
      await runClear(args);
    },
  });
