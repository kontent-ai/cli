import type { RegisterCommand } from "../../types/yargs.js";

export const register: RegisterCommand = (y, deps) =>
  y.command({
    command: "logout",
    describe: "Clear stored authentication tokens",
    builder: (b) => b,
    handler: async (args) => {
      const { runLogout } = await import("./runLogout.js");
      await runLogout(args, deps);
    },
  });
