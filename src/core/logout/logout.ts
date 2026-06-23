import { createKeyringStorage } from "../../lib/auth/storage.js";
import type { AuthError } from "../../lib/auth/types.js";
import { writeCliConfig } from "../../lib/config/cliConfig.js";
import { err, isErr, ok, type Result } from "../../lib/result.js";
import { type LogOptions, logWarning } from "../../log.js";

export type LogoutParams = LogOptions;

export const performLogout = async (params: LogoutParams): Promise<Result<void, AuthError>> => {
  const storage = createKeyringStorage();
  const cleared = await storage.clear();
  if (isErr(cleared)) {
    return err(cleared.error);
  }
  // Drop the cached userId so telemetry stops identifying the previous user.
  const clearedUserId = await writeCliConfig({ userId: undefined });
  if (isErr(clearedUserId)) {
    logWarning(params, "verbose", `Could not clear cached userId: ${clearedUserId.error}`);
  }
  return ok(undefined);
};
