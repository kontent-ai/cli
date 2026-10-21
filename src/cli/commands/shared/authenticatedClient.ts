import type { AuthError } from "../../../core/auth/types.js";
import { iapiBaseUrl, type KontentTarget } from "../../../core/kontentUrl/kontentUrl.js";
import { isErr, ok, type Result } from "../../../core/lib/result.js";
import { getValidAccessToken } from "../../adapters/auth/tokenAccess.js";
import { createIapiClient, type IapiClient } from "../../adapters/iapi/client.js";
import type { Logger } from "../../log.js";
import { ensureUserIdCached } from "./user.js";

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
