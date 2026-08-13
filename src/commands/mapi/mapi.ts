import type { RegisterCommand } from "../../types/yargs.js";
import { register as registerRequest } from "./request.js";

// A parent with a default child, not a flat `mapi <endpoint>`: flat siblings would
// both key on `mapi`, and the later registration would silently swallow every
// endpoint. Any future subcommand name is also permanently unreachable as an
// endpoint, so it must not collide with a Management API path segment.
const subcommandsToRegister: ReadonlyArray<RegisterCommand> = [registerRequest];

export const register: RegisterCommand = (y, deps) =>
  y.command({
    command: "mapi",
    describe: "Management API commands",
    builder: (sub) =>
      subcommandsToRegister.reduce((current, registerSub) => registerSub(current, deps), sub),
    handler: () => {
      // parent command is a group; the default subcommand handles execution
    },
  });
