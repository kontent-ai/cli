import type { RegisterCommand } from "../../types/yargs.js";
import { register as registerRequest } from "./request/request.js";

// A parent with a default child, as `kontent mapi`: any future subcommand name is
// permanently unreachable as an endpoint, so it must not collide with a Delivery path segment.
const subcommandsToRegister: ReadonlyArray<RegisterCommand> = [registerRequest];

export const register: RegisterCommand = (y, deps) =>
  y.command({
    command: "dapi",
    describe: "Read content through the Delivery API: published, or latest with --preview.",
    builder: (sub) =>
      subcommandsToRegister.reduce((current, registerSub) => registerSub(current, deps), sub),
    handler: () => {
      // parent command is a group; the default subcommand handles execution
    },
  });
