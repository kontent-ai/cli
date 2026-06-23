import {
  type BaseUrl,
  getDefaultHttpService,
  type KontentSdkError,
  type SdkConfig,
  type SdkInfo,
} from "@kontent-ai/core-sdk";

// biome-ignore lint/correctness/useImportExtensions: JSON imports must keep the .json extension
import pkg from "../../../package.json" with { type: "json" };
import { iapiBaseUrl } from "../config/iapiUrl.js";

const iapiSdkInfo: SdkInfo = {
  name: pkg.name,
  version: pkg.version,
  host: "npmjs.com",
};

export const iapiEndpointUrl = (base: BaseUrl, path: string): URL =>
  new URL(path, `${base.protocol}://${base.host}`);

export type IapiClient = Readonly<{
  config: SdkConfig;
  sdkInfo: SdkInfo;
  urlBase: BaseUrl;
  token: string;
}>;

export const createIapiClient = ({
  token,
  baseUrl = iapiBaseUrl,
}: {
  readonly token: string;
  readonly baseUrl?: BaseUrl;
}): IapiClient => ({
  config: {
    baseUrl,
    httpService: getDefaultHttpService({
      requestHeaders: [{ name: "Origin", value: `${baseUrl.protocol}://${baseUrl.host}` }],
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
