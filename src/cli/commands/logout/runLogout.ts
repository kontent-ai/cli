import type { AuthError } from "../../../core/auth/types.js";
import { err, isErr, ok, type Result } from "../../../core/lib/result.js";
import { createKeyringStorage, type TokenStorage } from "../../adapters/auth/storage.js";
import { type CliConfigStore, cliConfigStore } from "../../adapters/config/cliConfig.js";
import type { Logger } from "../../log.js";
import type { CommandOutcome } from "../shared/commandOutcome.js";
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
      `Could not clear the stored default environment and user ID; they stay in the config file: ${clearedUserData.error}`,
    );
  }
  return ok(undefined);
};

export const runLogout = async (logger: Logger): Promise<CommandOutcome> => {
  const result = await logout({ logger, tokens: createKeyringStorage(), config: cliConfigStore });
  if (isErr(result)) {
    logger.error(formatAuthError(result.error));
    return { status: "error", reason: "failure", errorCode: result.error.kind };
  }
  logger.info("standard", "Logged out.");
  return { status: "success" };
};
