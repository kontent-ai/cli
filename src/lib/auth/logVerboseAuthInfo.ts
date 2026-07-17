import { inspect } from "node:util";

import { Issuer } from "openid-client";

import { isVerbose, type LogOptions, logInfo } from "../../log.js";
import type { Auth0Config } from "./config.js";
import type { TokenSet } from "./types.js";

export const logVerboseAuthInfo = async (
  params: LogOptions,
  config: Auth0Config,
  tokens: TokenSet,
): Promise<void> => {
  if (!isVerbose(params)) {
    return;
  }

  try {
    const issuer = await Issuer.discover(`https://${config.domain}`);
    const client = new issuer.Client({
      client_id: config.clientId,
      token_endpoint_auth_method: "none",
      id_token_signed_response_alg: "RS256",
    });
    const userInfo = await client.userinfo(tokens.accessToken);
    logInfo(params, "verbose", `\n\nUserInfo response ${inspectValue(userInfo)}`);
  } catch {
    // userinfo errors are swallowed; access token may not be eligible for the userinfo endpoint
  }
};

const inspectValue = (value: unknown): string =>
  inspect(value, { depth: null, colors: false, compact: false });
