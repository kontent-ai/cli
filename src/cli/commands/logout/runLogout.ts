import type { AuthError } from "../../../core/auth/types.js";
import { err, isErr, ok, type Result } from "../../../core/lib/result.js";
import {
  createKeyringStorage,
  createLegacyTokens,
  type LegacyEntry,
  type TokenStorage,
} from "../../adapters/auth/storage.js";
import type { CliConfigStore } from "../../adapters/config/cliConfig.js";
import type { Logger } from "../../log.js";
import type { CommandDeps } from "../../types/yargs.js";
import { type CommandOutcome, createFailureOutcome } from "../shared/commandOutcome.js";
import { formatAuthError } from "../shared/formatAuthError.js";

export type LogoutEffects = Readonly<{
  logger: Logger;
  tokens: Pick<TokenStorage, "clear">;
  legacyTokens: LegacyEntry;
  config: Pick<CliConfigStore, "write">;
}>;

export const logout = async (effects: LogoutEffects): Promise<Result<void, AuthError>> => {
  const cleared = await effects.tokens.clear();
  await effects.legacyTokens.remove();
  if (isErr(cleared)) {
    return err(cleared.error);
  }
  // Drop what belongs to the previous user: the userId telemetry identifies them by,
  // and the default environment they selected, which the next account may not reach.
  const clearedUserData = await effects.config.write({ userId: undefined, envId: undefined });
  if (isErr(clearedUserData)) {
    effects.logger.warning(
      "standard",
      `Could not clear the stored default environment and user ID; they stay in the config file: ${clearedUserData.error}`,
    );
  }
  return ok(undefined);
};

export const runLogout = async (deps: CommandDeps, logger: Logger): Promise<CommandOutcome> => {
  const result = await logout({
    logger,
    tokens: createKeyringStorage(deps.login.context),
    legacyTokens: createLegacyTokens(logger),
    config: deps.config,
  });
  if (isErr(result)) {
    logger.error(formatAuthError(result.error));
    return createFailureOutcome(result.error.kind);
  }
  logger.info("standard", "Logged out.");
  return { status: "success" };
};
