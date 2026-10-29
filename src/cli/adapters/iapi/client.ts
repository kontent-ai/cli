import {
  type BaseUrl,
  getDefaultHttpService,
  type JsonValue,
  type KontentSdkError,
  type QueryResponse,
  type SafeQueryResult,
  type SdkConfig,
  type SdkInfo,
} from "@kontent-ai/core-sdk";

// biome-ignore lint/correctness/useImportExtensions: JSON imports must keep the .json extension
import pkg from "../../../../package.json" with { type: "json" };
import { originOf } from "../../../core/lib/baseUrl.js";
import { err, ok, type Result } from "../../../core/lib/result.js";

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

/** core-sdk answers with its own success/failure shape; capabilities speak `Result`. */
export const fromSdkResult = <TPayload extends JsonValue, TError>(
  result: SafeQueryResult<QueryResponse<TPayload, unknown, unknown>, TError>,
): Result<TPayload, TError> => (result.success ? ok(result.response.payload) : err(result.error));
