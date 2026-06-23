import { getValidAccessToken } from "../../lib/auth/tokenAccess.js";
import type { AuthError } from "../../lib/auth/types.js";
import { createIapiClient, type IapiClient } from "../../lib/iapi/client.js";
import { isErr, ok, type Result } from "../../lib/result.js";
import type { LogOptions } from "../../log.js";
import { ensureUserIdCached } from "../user/user.js";

export const getAuthenticatedIapiClient = async (
  params: LogOptions,
): Promise<Result<IapiClient, AuthError>> => {
  const tokenResult = await getValidAccessToken();
  if (isErr(tokenResult)) {
    return tokenResult;
  }
  const client = createIapiClient({ token: tokenResult.value });
  await ensureUserIdCached(params, { client });
  return ok(client);
};
