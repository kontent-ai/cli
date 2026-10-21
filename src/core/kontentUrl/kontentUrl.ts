import type { BaseUrl } from "@kontent-ai/core-sdk";
import { match } from "ts-pattern";
import { originOf } from "../lib/baseUrl.js";
import { err, flatMap, fromThrowable, ok, type Result } from "../lib/result.js";

declare const __KONTENT_URL__: string | undefined;

const DEFAULT_KONTENT_DOMAIN = "kontent.ai";

// The only domains the CLI may talk to, besides on-demand environments and this machine's
// loopback addresses. Guards a poisoned KONTENT_URL from steering authenticated requests
// (bearer token included) at another host.
const allowedKontentDomains = ["kontent.ai", "devkontentmasters.com"] as const;

/**
 * Where the CLI sends its requests. A `domain` has the internal API on `app.<domain>`
 * and the Management API on `manage.<domain>`; a `host` (an on-demand environment, a
 * locally running stack) serves both itself, under `/api` and `/manageApi/v2`.
 */
export type KontentTarget =
  | Readonly<{ kind: "domain"; domain: string }>
  | Readonly<{ kind: "host"; baseUrl: BaseUrl }>;

const bakedUrl =
  typeof __KONTENT_URL__ === "string" && __KONTENT_URL__ !== "" ? __KONTENT_URL__ : undefined;

export const resolveKontentTarget = (env: NodeJS.ProcessEnv): Result<KontentTarget, string> =>
  validateKontentUrl(env.KONTENT_URL ?? bakedUrl ?? DEFAULT_KONTENT_DOMAIN);

export const iapiBaseUrl = (target: KontentTarget): BaseUrl =>
  match(target)
    .with(
      { kind: "domain" },
      ({ domain }): BaseUrl => ({ protocol: "https", host: `app.${domain}` }),
    )
    .with({ kind: "host" }, ({ baseUrl }) => baseUrl)
    .exhaustive();

export const mapiBaseUrl = (target: KontentTarget): string =>
  match(target)
    .with({ kind: "domain" }, ({ domain }) => `https://manage.${domain}/v2`)
    .with({ kind: "host" }, ({ baseUrl }) => `${originOf(baseUrl)}/manageApi/v2`)
    .exhaustive();

/**
 * Either one of the allowed domains, with no scheme, path, port, or credentials, since it is
 * interpolated verbatim into the app./manage. request hosts.
 * Or the address of one host serving both APIs: an on-demand environment over https without
 * a port, or a loopback address over http(s) with an optional port; no path, query, fragment,
 * or credentials.
 */
const validateKontentUrl = (raw: string): Result<KontentTarget, string> =>
  /^https?:\/\//i.test(raw) ? validateHostAddress(raw) : validateDomain(raw);

const loopbackHosts: ReadonlyArray<string> = ["localhost", "127.0.0.1", "[::1]"];

// One label only: an arbitrary subdomain of an allowed domain can be served by a third party.
const onDemandHostPattern = /^[a-z0-9-]+-draft\.devkontentmasters\.com$/;

const validateHostAddress = (raw: string): Result<KontentTarget, string> =>
  flatMap(parseUrl(raw, raw), (url) => {
    const isAllowedAddress =
      loopbackHosts.includes(url.hostname) ||
      (url.protocol === "https:" && url.port === "" && onDemandHostPattern.test(url.hostname));
    const isBareAddress =
      url.username === "" &&
      url.password === "" &&
      url.pathname === "/" &&
      url.search === "" &&
      url.hash === "";

    return isAllowedAddress && isBareAddress
      ? ok({
          kind: "host",
          baseUrl: { protocol: url.protocol === "http:" ? "http" : "https", host: url.host },
        })
      : err(invalidKontentUrlMessage(raw));
  });

const parseUrl = (url: string, raw: string): Result<URL, string> =>
  fromThrowable(
    () => new URL(url),
    () => invalidKontentUrlMessage(raw),
  );

const invalidKontentUrlMessage = (raw: string): string =>
  `Invalid KONTENT_URL "${raw}": it must be a Kontent.ai domain without a scheme (${allowedKontentDomains.join(
    ", ",
  )}, with no path, port, or credentials); or the address of one host serving both APIs: https://<label>-draft.devkontentmasters.com, or http(s)://localhost, 127.0.0.1 or [::1] with an optional port, with no path, query, fragment, or credentials.`;

const validateDomain = (raw: string): Result<KontentTarget, string> =>
  flatMap(parseUrl(`https://${raw}`, raw), ({ hostname }) => {
    const isBareAllowedHost =
      hostname === raw.toLowerCase() && allowedKontentDomains.some((domain) => domain === hostname);

    return isBareAllowedHost
      ? ok({ kind: "domain", domain: hostname })
      : err(invalidKontentUrlMessage(raw));
  });
