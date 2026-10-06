import type { RegisterCommand } from "../../types/yargs.js";

export const register: RegisterCommand = (y, deps) =>
  y.command({
    command: "login",
    describe: "Authenticate with Kontent.ai via Auth0 device flow",
    builder: (b) => b,
    handler: async (args) => {
      const { runLogin } = await import("./runLogin.js");
      await runLogin(args, deps);
    },
  });
