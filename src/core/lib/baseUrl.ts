import type { BaseUrl } from "@kontent-ai/core-sdk";

export const originOf = (baseUrl: BaseUrl): string => `${baseUrl.protocol}://${baseUrl.host}`;
