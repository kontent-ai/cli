import type { AuthError } from "../../../core/auth/types.js";
import { iapiBaseUrl, type KontentTarget } from "../../../core/kontentUrl/kontentUrl.js";
import { isErr, ok, type Result } from "../../../core/lib/result.js";
import type { Logger } from "../../log.js";
import { cliConfigStore } from "../config/cliConfig.js";
import { createIapiClient, type IapiClient } from "../iapi/client.js";
import { createUsers } from "../iapi/users.js";
import { session } from "./tokenAccess.js";
import { ensureUserIdCached } from "./userId.js";

export const getAuthenticatedIapiClient = async (
  logger: Logger,
  kontentTarget: KontentTarget,
): Promise<Result<IapiClient, AuthError>> => {
  const tokenResult = await session.tokens();
  if (isErr(tokenResult)) {
    return tokenResult;
  }
  const client = createIapiClient({
    token: tokenResult.value.accessToken,
    baseUrl: iapiBaseUrl(kontentTarget),
  });
  await ensureUserIdCached(
    { logger, users: createUsers(client), config: cliConfigStore },
    { shouldForceRefresh: false },
  );
  return ok(client);
};
