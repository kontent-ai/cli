import {
  type BaseUrl,
  createFetchQuery,
  type FetchQuery,
  getDefaultHttpService,
  type HttpAdapter,
  type JsonValue,
  type KontentSdkError,
  type SchemaInput,
  type SdkConfig,
  type SdkInfo,
} from "@kontent-ai/core-sdk";
// biome-ignore lint/correctness/useImportExtensions: JSON imports must keep the .json extension
import pkg from "../../../package.json" with { type: "json" };
import type { ApiReference } from "./apiReference.js";

/** The Learn-MCP service needs no auth, so the client carries no token. */
export type LearnClient = Readonly<{
  config: SdkConfig;
  sdkInfo: SdkInfo;
  baseUrl: BaseUrl;
}>;

export const createLearnClient = (
  params: Readonly<{ adapter?: HttpAdapter; baseUrl?: BaseUrl }> = {},
): LearnClient => {
  const baseUrl = params.baseUrl ?? learnBaseUrl;

  return {
    config: {
      baseUrl,
      httpService: getDefaultHttpService({
        ...(params.adapter === undefined ? {} : { adapter: params.adapter }),
      }),
      // core-sdk runs the schema only when this is on; without it the endpoint
      // schemas would be types with nothing behind them.
      runtimeValidation: { validateResponses: true },
    },
    sdkInfo: learnSdkInfo,
    baseUrl,
  };
};

/** `apiReference` narrows the candidates before the service ranks them. */
export type LearnQueryParams = Readonly<{ text: string; apiReference?: ApiReference }>;

export const createLearnQuery = <TPayload extends JsonValue>(
  client: LearnClient,
  path: string,
  params: LearnQueryParams,
  schema: SchemaInput<TPayload>,
): FetchQuery<TPayload> => {
  const url = new URL(path, `${client.baseUrl.protocol}://${client.baseUrl.host}`);
  url.searchParams.set("text", params.text);
  if (params.apiReference !== undefined) {
    url.searchParams.set("apiReference", params.apiReference);
  }

  return createFetchQuery({
    url,
    schema,
    config: client.config,
    sdkInfo: client.sdkInfo,
    mapError: (e: KontentSdkError) => e,
    mapMetadata: () => ({}),
    mapExtraResponseProps: () => ({}),
  });
};

const learnBaseUrl: BaseUrl = { protocol: "https", host: "learn-mcp.kontent.ai" };

const learnSdkInfo: SdkInfo = {
  name: pkg.name,
  version: pkg.version,
  host: "npmjs.com",
};
