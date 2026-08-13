import type { Header, HttpMethod, JsonValue } from "@kontent-ai/core-sdk";
import { executeRawRequest, type MapiRawClient } from "../../lib/mapi/raw/client.js";
import { resolveEndpoint } from "../../lib/mapi/raw/endpoint.js";
import { err, isErr, ok, type Result } from "../../lib/result.js";
import type { Logger } from "../../log.js";

export type MapiRequestParams = Readonly<{
  endpoint: string;
  envId: string;
  method: HttpMethod;
  headers: ReadonlyArray<Header>;
  body: string | Blob | null;
  abortSignal?: AbortSignal;
}>;

export type MapiResponse = Readonly<{
  statusCode: number;
  statusText: string;
  headers: ReadonlyArray<Header>;
  payload: JsonValue;
}>;

/**
 * `transport` is reserved for a request that could not be made; every HTTP status
 * the API answers with, including 4xx and 5xx, is an `ok` result. The remaining
 * kinds are raised by the command while it builds the params.
 */
export type MapiRequestError =
  | Readonly<{ kind: "invalid-endpoint"; message: string }>
  | Readonly<{ kind: "invalid-header"; message: string }>
  | Readonly<{ kind: "invalid-method"; message: string }>
  | Readonly<{ kind: "unreadable-input"; message: string }>
  | Readonly<{ kind: "transport"; message: string }>;

export const performMapiRequest = async (
  params: MapiRequestParams,
  deps: Readonly<{ logger: Logger; client: MapiRawClient }>,
): Promise<Result<MapiResponse, MapiRequestError>> => {
  const url = resolveEndpoint(params.endpoint, {
    baseUrl: deps.client.baseUrl,
    envId: params.envId,
  });
  if (isErr(url)) {
    return err({ kind: "invalid-endpoint", message: url.error.message });
  }

  const response = await executeRawRequest(
    deps.client,
    {
      url: url.value,
      method: params.method,
      headers: params.headers,
      body: params.body,
      abortSignal: params.abortSignal,
    },
    deps.logger,
  );
  if (isErr(response)) {
    return err({ kind: "transport", message: response.error });
  }

  return ok({
    statusCode: response.value.status,
    statusText: response.value.statusText,
    headers: response.value.responseHeaders,
    payload: response.value.payload,
  });
};
