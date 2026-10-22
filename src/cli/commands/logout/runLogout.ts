import type { AuthError } from "../../../core/auth/types.js";
import { err, isErr, ok, type Result } from "../../../core/lib/result.js";
import { createKeyringStorage, type TokenStorage } from "../../adapters/auth/storage.js";
import { type CliConfigStore, cliConfigStore } from "../../adapters/config/cliConfig.js";
import { createLoggerFromArgs, type Logger, type LogOptions } from "../../log.js";
import type { CommandDeps } from "../../types/yargs.js";
import { formatAuthError } from "../shared/formatAuthError.js";

export type LogoutEffects = Readonly<{
  logger: Logger;
  tokens: Pick<TokenStorage, "clear">;
  config: Pick<CliConfigStore, "write">;
}>;

export const logout = async (effects: LogoutEffects): Promise<Result<void, AuthError>> => {
  const cleared = await effects.tokens.clear();
  if (isErr(cleared)) {
    return err(cleared.error);
  }
  // Drop what belongs to the previous user: the userId telemetry identifies them by,
  // and the default environment they selected, which the next account may not reach.
  const clearedUserData = await effects.config.write({ userId: undefined, envId: undefined });
  if (isErr(clearedUserData)) {
    effects.logger.warning(
      "standard",
      `Could not clear cached user data: ${clearedUserData.error}`,
    );
  }
  return ok(undefined);
};

export const runLogout = async (args: LogOptions, deps: CommandDeps): Promise<void> => {
  const logger = createLoggerFromArgs(args);
  const tracker = deps.telemetry.startCommandTracking("logout", logger);

  const result = await logout({ logger, tokens: createKeyringStorage(), config: cliConfigStore });
  if (isErr(result)) {
    tracker.fail(result.error.kind);
    logger.error(formatAuthError(result.error));
    process.exitCode = 1;
    return;
  }
  tracker.succeed();
  logger.info("standard", "Logged out.");
};
