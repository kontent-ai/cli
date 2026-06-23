export type Auth0Config = Readonly<{
  domain: string;
  clientId: string;
  audience?: string;
  scope: string;
}>;

// Baked at build time by tsdown from KONTENT_AUTH0_*; "" when unset. typeof
// guards the undeclared case (tsx).
declare const __AUTH0_DOMAIN__: string | undefined;
declare const __AUTH0_CLIENT_ID__: string | undefined;
declare const __AUTH0_AUDIENCE__: string | undefined;

const bakedDomain = typeof __AUTH0_DOMAIN__ === "string" ? __AUTH0_DOMAIN__ : "";
const bakedClientId = typeof __AUTH0_CLIENT_ID__ === "string" ? __AUTH0_CLIENT_ID__ : "";
const bakedAudience = typeof __AUTH0_AUDIENCE__ === "string" ? __AUTH0_AUDIENCE__ : "";

export const getAuth0Config = (env: NodeJS.ProcessEnv = process.env): Auth0Config => ({
  domain: env.KONTENT_AUTH0_DOMAIN ?? bakedDomain,
  clientId: env.KONTENT_AUTH0_CLIENT_ID ?? bakedClientId,
  audience: env.KONTENT_AUTH0_AUDIENCE ?? bakedAudience,
  scope: "openid profile email offline_access",
});
