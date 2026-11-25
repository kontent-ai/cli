import type { CommandModule } from "yargs";
import type { KontentTarget } from "../../core/kontentUrl/kontentUrl.js";
import type { Overrides } from "../../core/overrides/overrides.js";
import type { LoginSetup } from "../adapters/auth/tokenAccess.js";
import type { CliConfigStore } from "../adapters/config/cliConfig.js";
import type { Telemetry } from "../adapters/telemetry/tracking.js";
import type { LogOptions } from "../log.js";

type MakeRequired<T, Keys extends keyof T> = Omit<T, Keys> & Required<Pick<T, Keys>>;

export type StandaloneCommandModule<T = unknown, U = unknown> = MakeRequired<
  CommandModule<T, U>,
  "command" | "describe"
>;

export type CommandDeps = Readonly<{
  telemetry: Telemetry;
  isCiRun: boolean;
  kontentTarget: KontentTarget;
  overrides: Overrides;
  config: CliConfigStore;
  login: LoginSetup;
}>;

export type RegisterCommand = <Result, InitialParams extends LogOptions = LogOptions>(
  obj: Readonly<{
    command: <CommandParams extends InitialParams = InitialParams>(
      cmdModule: StandaloneCommandModule<InitialParams, CommandParams>,
    ) => Result;
  }>,
  deps: CommandDeps,
) => Result;
