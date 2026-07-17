import { err, fromThrowable, ok, type Result } from "../result.js";

declare const __KONTENT_URL__: string | undefined;

const DEFAULT_KONTENT_DOMAIN = "kontent.ai";

// The only domains the CLI may talk to. Guards a poisoned KONTENT_URL from
// steering authenticated requests (bearer token included) at another host.
export const allowedKontentDomains = ["kontent.ai", "devkontentmasters.com"] as const;

const bakedDomain =
  typeof __KONTENT_URL__ === "string" && __KONTENT_URL__ !== "" ? __KONTENT_URL__ : undefined;

export const getKontentBaseDomain = (): string =>
  process.env.KONTENT_URL ?? bakedDomain ?? DEFAULT_KONTENT_DOMAIN;

export const kontentAppHost = (): string => `app.${getKontentBaseDomain()}`;

export const kontentManagementUrl = (): string => `https://manage.${getKontentBaseDomain()}/v2`;

const isAllowedHost = (host: string): boolean =>
  allowedKontentDomains.some((domain) => host === domain || host.endsWith(`.${domain}`));

const invalidDomainMessage = (raw: string): string =>
  `Invalid KONTENT_URL "${raw}": it must be one of the allowed Kontent.ai domains (${allowedKontentDomains.join(
    ", ",
  )}) or a subdomain of them, with no scheme, path, port, or credentials.`;

/**
 * Validates the resolved base domain against the Kontent.ai allow-list. Only a
 * bare host that is (or is a subdomain of) an allowed domain passes — anything
 * carrying a scheme, path, port, or embedded credentials is rejected, since the
 * value is interpolated verbatim into the app./manage. request hosts.
 */
export const validateKontentDomain = (raw: string): Result<string, string> => {
  const parsed = fromThrowable(
    () => new URL(`https://${raw}`),
    () => invalidDomainMessage(raw),
  );

  if (parsed.kind === "err") {
    return parsed;
  }

  const host = parsed.value.hostname;
  const isBareAllowedHost = host === raw.toLowerCase() && isAllowedHost(host);

  return isBareAllowedHost ? ok(host) : err(invalidDomainMessage(raw));
};
