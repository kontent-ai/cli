import {
  type BaseUrl,
  getDefaultHttpService,
  type HttpAdapter,
  type HttpMethod,
  type HttpRequestBody,
  type HttpService,
  type HttpServiceRequestOptions,
  type JsonValue,
  type KontentSdkError,
  type QueryResponse,
  type SafeQueryResult,
  type SdkConfig,
  type SdkInfo,
} from "@kontent-ai/core-sdk";

import { originOf } from "../../../core/lib/baseUrl.js";
import { err, ok, type Result } from "../../../core/lib/result.js";
import { isNodeFetchTimeout } from "../http/nodeFetchTimeout.js";
import { MAX_RETRY_DELAY_MS } from "../http/retryDelay.js";
import { cliSdkInfo } from "../http/sdkInfo.js";

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
  adapter,
}: {
  readonly token: string;
  readonly baseUrl: BaseUrl;
  readonly adapter?: HttpAdapter;
}): IapiClient => ({
  config: { baseUrl, httpService: createIapiHttpService(baseUrl, adapter) },
  sdkInfo: cliSdkInfo,
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

// core-sdk resolves the retry strategy per service and hands `canRetryAdapterError` no
// method, so each request goes through a service built for its own method.
const createIapiHttpService = (baseUrl: BaseUrl, adapter: HttpAdapter | undefined): HttpService => {
  const serviceFor = (method: HttpMethod): HttpService =>
    getDefaultHttpService({
      requestHeaders: [{ name: "Origin", value: originOf(baseUrl) }],
      // No CLI deadline until core-sdk-js#57 adds a timeout option; Node's fetch limits apply.
      ...(adapter === undefined ? {} : { adapter }),
      retryStrategy: {
        maxRetries: 3,
        maxRetryDelayMs: MAX_RETRY_DELAY_MS,
        // Only a GET is safe to resend after a lost connection: a second POST could create a
        // second delivery key. A Node timeout is not resent: it comes after 300 s, and core-sdk
        // resends at once.
        canRetryAdapterError: (error) =>
          method === "GET" && !isNodeFetchTimeout(error.details.originalError),
      },
    });

  return {
    request: async <TPayload extends JsonValue, TBody extends HttpRequestBody>(
      options: HttpServiceRequestOptions<TBody>,
    ) => serviceFor(options.method).request<TPayload, TBody>(options),
    downloadFile: async (options) => serviceFor("GET").downloadFile(options),
    uploadFile: async (options) => serviceFor(options.method).uploadFile(options),
  };
};
