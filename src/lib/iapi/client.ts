import {
  type BaseUrl,
  getDefaultHttpService,
  type KontentSdkError,
  type SdkConfig,
  type SdkInfo,
} from "@kontent-ai/core-sdk";

// biome-ignore lint/correctness/useImportExtensions: JSON imports must keep the .json extension
import pkg from "../../../package.json" with { type: "json" };
import { originOf } from "../baseUrl.js";

const iapiSdkInfo: SdkInfo = {
  name: pkg.name,
  version: pkg.version,
  host: "npmjs.com",
};

export const iapiEndpointUrl = (base: BaseUrl, path: string): URL => new URL(path, originOf(base));

export type IapiClient = Readonly<{
  config: SdkConfig;
  sdkInfo: SdkInfo;
  urlBase: BaseUrl;
  token: string;
}>;

export const createIapiClient = ({
  token,
  baseUrl,
}: {
  readonly token: string;
  readonly baseUrl: BaseUrl;
}): IapiClient => ({
  config: {
    baseUrl,
    httpService: getDefaultHttpService({
      requestHeaders: [{ name: "Origin", value: originOf(baseUrl) }],
      retryStrategy: {
        maxRetries: 3,
        canRetryAdapterError: () => true,
      },
    }),
  },
  sdkInfo: iapiSdkInfo,
  urlBase: baseUrl,
  token,
});

export const iapiQueryBase = (c: IapiClient) => ({
  config: c.config,
  sdkInfo: c.sdkInfo,
  authorizationApiKey: c.token,
  mapError: (e: KontentSdkError) => e,
  mapMetadata: () => ({}),
  mapExtraResponseProps: () => ({}),
});
