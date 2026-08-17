import type { KontentSdkError } from "@kontent-ai/core-sdk";

import type { AuthError } from "../../lib/auth/types.js";
import { readCliConfig, writeCliConfig } from "../../lib/config/cliConfig.js";
import type { IapiClient } from "../../lib/iapi/client.js";
import { getUser, type UserInfo } from "../../lib/iapi/endpoints/getUser.js";
import { err, isErr, ok, type Result } from "../../lib/result.js";
import type { Logger } from "../../log.js";

export type UserError =
  | { readonly kind: "auth-failed"; readonly authError: AuthError }
  | { readonly kind: "fetch-failed"; readonly sdkError: KontentSdkError };

type EnsureUserIdOptions = Readonly<{ client: IapiClient; shouldForceRefresh?: boolean }>;

// Best-effort: never throws, so a /user failure can't break login.
export const ensureUserIdCached = async (
  logger: Logger,
  options: EnsureUserIdOptions,
): Promise<void> => {
  const cached = (await readCliConfig()).userId;
  if (cached !== undefined && options.shouldForceRefresh !== true) {
    return;
  }

  const result = await fetchUser(options.client);
  if (isErr(result)) {
    logger.warning("verbose", `Could not cache userId: ${formatUserError(result.error)}`);
    return;
  }

  const written = await writeCliConfig({ userId: result.value.userId });
  if (isErr(written)) {
    logger.warning("verbose", `Could not persist userId: ${written.error}`);
  }
};

const fetchUser = async (client: IapiClient): Promise<Result<UserInfo, UserError>> => {
  const result = await getUser(client).fetchSafe();
  if (!result.success) {
    return err({ kind: "fetch-failed", sdkError: result.error });
  }
  return ok(result.response.payload);
};

const formatUserError = (error: UserError): string =>
  error.kind === "auth-failed" ? error.authError.kind : error.sdkError.message;
