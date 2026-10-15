import { getValidAccessToken } from "../../lib/auth/tokenAccess.js";
import type { AuthError } from "../../lib/auth/types.js";
import { iapiBaseUrl, type KontentTarget } from "../../lib/config/kontentUrl.js";
import { createIapiClient, type IapiClient } from "../../lib/iapi/client.js";
import { isErr, ok, type Result } from "../../lib/result.js";
import type { Logger } from "../../log.js";
import { ensureUserIdCached } from "../user/user.js";

export const getAuthenticatedIapiClient = async (
  logger: Logger,
  kontentTarget: KontentTarget,
): Promise<Result<IapiClient, AuthError>> => {
  const tokenResult = await getValidAccessToken();
  if (isErr(tokenResult)) {
    return tokenResult;
  }
  const client = createIapiClient({
    token: tokenResult.value,
    baseUrl: iapiBaseUrl(kontentTarget),
  });
  await ensureUserIdCached(logger, { client });
  return ok(client);
};
