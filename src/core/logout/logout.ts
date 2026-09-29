import { createKeyringStorage } from "../../lib/auth/storage.js";
import type { AuthError } from "../../lib/auth/types.js";
import { writeCliConfig } from "../../lib/config/cliConfig.js";
import { err, isErr, ok, type Result } from "../../lib/result.js";
import type { Logger } from "../../log.js";

export const performLogout = async (logger: Logger): Promise<Result<void, AuthError>> => {
  const storage = createKeyringStorage();
  const cleared = await storage.clear();
  if (isErr(cleared)) {
    return err(cleared.error);
  }
  // Drop what belongs to the previous user: the userId telemetry identifies them by,
  // and the default environment they selected, which the next account may not reach.
  const clearedUserData = await writeCliConfig({ userId: undefined, envId: undefined });
  if (isErr(clearedUserData)) {
    logger.warning("standard", `Could not clear cached user data: ${clearedUserData.error}`);
  }
  return ok(undefined);
};
