declare const __KONTENT_URL__: string | undefined;

const DEFAULT_KONTENT_DOMAIN = "kontent.ai";

const bakedDomain =
  typeof __KONTENT_URL__ === "string" && __KONTENT_URL__ !== "" ? __KONTENT_URL__ : undefined;

const getKontentBaseDomain = (): string =>
  process.env.KONTENT_URL ?? bakedDomain ?? DEFAULT_KONTENT_DOMAIN;

export const kontentAppHost = (): string => `app.${getKontentBaseDomain()}`;

export const kontentManagementUrl = (): string => `https://manage.${getKontentBaseDomain()}/v2`;
