import type { CommandModule } from "yargs";
import type { Telemetry } from "../lib/telemetry/tracking.js";
import type { LogOptions } from "../log.js";

type MakeRequired<T, Keys extends keyof T> = Omit<T, Keys> & Required<Pick<T, Keys>>;

export type StandaloneCommandModule<T = unknown, U = unknown> = MakeRequired<
  CommandModule<T, U>,
  "command" | "describe"
>;

export type CommandDeps = Readonly<{
  telemetry: Telemetry;
}>;

export type RegisterCommand = <Result, InitialParams extends LogOptions = LogOptions>(
  obj: Readonly<{
    command: <CommandParams extends InitialParams = InitialParams>(
      cmdModule: StandaloneCommandModule<InitialParams, CommandParams>,
    ) => Result;
  }>,
  deps: CommandDeps,
) => Result;
