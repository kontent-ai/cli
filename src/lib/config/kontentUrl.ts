import type { BaseUrl } from "@kontent-ai/core-sdk";
import { match } from "ts-pattern";
import { err, fromThrowable, ok, type Result } from "../result.js";

declare const __KONTENT_URL__: string | undefined;

const DEFAULT_KONTENT_DOMAIN = "kontent.ai";

// The only domains the CLI may talk to, besides this machine's loopback addresses.
// Guards a poisoned KONTENT_URL from steering authenticated requests (bearer token
// included) at another host.
export const allowedKontentDomains = ["kontent.ai", "devkontentmasters.com"] as const;

/**
 * Where the CLI sends its requests. A `domain` has the internal API on `app.<domain>`
 * and the Management API on `manage.<domain>`; a `host` (an on-demand environment, a
 * locally running stack) serves both itself, under `/api` and `/manageApi/v2`.
 */
export type KontentTarget =
  | Readonly<{ kind: "domain"; domain: string }>
  | Readonly<{ kind: "host"; protocol: BaseUrl["protocol"]; host: string }>;

const bakedUrl =
  typeof __KONTENT_URL__ === "string" && __KONTENT_URL__ !== "" ? __KONTENT_URL__ : undefined;

export const getKontentUrl = (): string =>
  process.env.KONTENT_URL ?? bakedUrl ?? DEFAULT_KONTENT_DOMAIN;

export const kontentAppBaseUrl = (): BaseUrl =>
  match(currentTarget())
    .with(
      { kind: "domain" },
      ({ domain }): BaseUrl => ({ protocol: "https", host: `app.${domain}` }),
    )
    .with({ kind: "host" }, ({ protocol, host }): BaseUrl => ({ protocol, host }))
    .exhaustive();

export const kontentManagementUrl = (): string =>
  match(currentTarget())
    .with({ kind: "domain" }, ({ domain }) => `https://manage.${domain}/v2`)
    .with({ kind: "host" }, ({ protocol, host }) => `${protocol}://${host}/manageApi/v2`)
    .exhaustive();

/**
 * Validates KONTENT_URL. Either a bare host that is (or is a subdomain of) an allowed
 * domain, with no scheme, path, port, or credentials, since it is interpolated verbatim
 * into the app./manage. request hosts. Or the address of one host serving both APIs:
 * https on an allowed domain without a port, or http(s) on a loopback address with an
 * optional port; no path, query, fragment, or credentials.
 */
export const validateKontentUrl = (raw: string): Result<KontentTarget, string> =>
  /^https?:\/\//i.test(raw) ? validateHostAddress(raw) : validateDomain(raw);

// Runs at import time (iapiUrl.ts), before src/index.ts validates the value and exits on
// an invalid one, so the fallback only has to avoid throwing: it never serves a request.
const currentTarget = (): KontentTarget => {
  const raw = getKontentUrl();
  const validated = validateKontentUrl(raw);
  return validated.kind === "ok" ? validated.value : { kind: "domain", domain: raw };
};

const validateDomain = (raw: string): Result<KontentTarget, string> => {
  const parsed = fromThrowable(
    () => new URL(`https://${raw}`),
    () => invalidKontentUrlMessage(raw),
  );

  if (parsed.kind === "err") {
    return parsed;
  }

  const host = parsed.value.hostname;
  const isBareAllowedHost = host === raw.toLowerCase() && isAllowedHost(host);

  return isBareAllowedHost
    ? ok({ kind: "domain", domain: host })
    : err(invalidKontentUrlMessage(raw));
};

const loopbackHosts: ReadonlyArray<string> = ["localhost", "127.0.0.1", "[::1]"];

const validateHostAddress = (raw: string): Result<KontentTarget, string> => {
  const parsed = fromThrowable(
    () => new URL(raw),
    () => invalidKontentUrlMessage(raw),
  );

  if (parsed.kind === "err") {
    return parsed;
  }

  const url = parsed.value;
  const isLoopback = loopbackHosts.includes(url.hostname);
  const domainWrittenAsAddress = isLoopback ? undefined : domainBehindHost(url.hostname);
  if (domainWrittenAsAddress !== undefined) {
    return err(domainWrittenAsAddressMessage(raw, domainWrittenAsAddress));
  }
  const isAllowedRemote =
    url.protocol === "https:" && url.port === "" && isAllowedHost(url.hostname);
  const isBareAddress =
    url.username === "" &&
    url.password === "" &&
    url.pathname === "/" &&
    url.search === "" &&
    url.hash === "";

  return (isLoopback || isAllowedRemote) && isBareAddress
    ? ok({ kind: "host", protocol: url.protocol === "http:" ? "http" : "https", host: url.host })
    : err(invalidKontentUrlMessage(raw));
};

const isAllowedHost = (host: string): boolean =>
  allowedKontentDomains.some((domain) => host === domain || host.endsWith(`.${domain}`));

// An allowed domain itself, or its app./manage. host, serves the two APIs on separate hosts,
// so as an address it is the domain form written with a scheme and would not work.
const domainBehindHost = (host: string): string | undefined => {
  const domain = host.replace(/^(?:app|manage)\./, "");
  const isDomainHost = host !== domain || allowedKontentDomains.some((allowed) => allowed === host);
  return isDomainHost && isAllowedHost(domain) ? domain : undefined;
};

const domainWrittenAsAddressMessage = (raw: string, domain: string): string =>
  `Invalid KONTENT_URL "${raw}": ${domain} serves its APIs on app.${domain} and manage.${domain}, not on one host. Set KONTENT_URL=${domain}, without a scheme.`;

const invalidKontentUrlMessage = (raw: string): string =>
  `Invalid KONTENT_URL "${raw}": it must be one of the allowed Kontent.ai domains (${allowedKontentDomains.join(
    ", ",
  )}) or a subdomain of them, with no scheme, path, port, or credentials; or the address of one host serving both APIs: https://<allowed host>, or http(s)://localhost, 127.0.0.1 or [::1] with an optional port, with no path, query, fragment, or credentials.`;
