import type { KontentTarget } from "../kontentUrl/kontentUrl.js";

export type Auth0Settings = Readonly<{
  domain: string;
  clientId: string;
  audience: string;
}>;

/**
 * Everything a stored login belongs to: the login server, the client and API it was issued
 * for, and the Kontent.ai target it is used against. A login of one context is never read,
 * refreshed or sent in another.
 */
export type LoginContext = Readonly<{
  auth0Domain: string;
  clientId: string;
  audience: string;
  target: KontentTarget;
}>;

export const loginContextFor = (auth0: Auth0Settings, target: KontentTarget): LoginContext => ({
  auth0Domain: auth0.domain,
  clientId: auth0.clientId,
  audience: auth0.audience,
  target,
});
