import {
  type AdapterPayload,
  type AdapterResponse,
  createSdkIdHeader,
  getDefaultHttpService,
  type Header,
  type HttpAdapter,
  type HttpMethod,
  type HttpService,
  type JsonValue,
  type KontentSdkError,
} from "@kontent-ai/core-sdk";
import { match, P } from "ts-pattern";
import { errorMessage } from "../../../../core/lib/error.js";
import { err, ok, type Result } from "../../../../core/lib/result.js";
import type { Logger } from "../../../log.js";
import { cliSdkInfo } from "../../http/sdkInfo.js";

const MAX_RETRY_ATTEMPTS = 3;
// Past this the API is rationing quota, not smoothing a burst. core-sdk clamps a
// longer `Retry-After` to the cap rather than giving up, so a rationing 429 costs
// at most MAX_RETRY_ATTEMPTS waits of this length before the status reaches the caller.
const MAX_RETRY_DELAY_MS = 60_000;

/**
 * A passthrough client for the Management API: no schema, no response
 * interpretation. The typed, validated counterpart is `src/cli/adapters/mapi/client.ts`.
 *
 * core-sdk's http service parses `application/json` and hands back a null payload
 * for anything else, which is all this needs: the Management API answers JSON on
 * every status, and binary only ever travels request-side, on an asset upload.
 */
type MapiRawClient = Readonly<{
  // The headers the service adds to every request; kept for the verbose trace,
  // which has to show what goes on the wire, not just what the caller passed.
  requestHeaders: ReadonlyArray<Header>;
  httpService: HttpService;
}>;

export type RawRequest = Readonly<{
  url: URL;
  method: HttpMethod;
  headers: ReadonlyArray<Header>;
  body: Blob | null;
  abortSignal?: AbortSignal;
}>;

/** What came off the wire, whatever the status says about it. */
export type RawResponse = Readonly<{
  status: number;
  statusText: string;
  responseHeaders: ReadonlyArray<Header>;
  payload: JsonValue;
}>;

/** What a workflow is handed: one call per request, sent with that request's credential. */
export type RawMapi = Readonly<{
  // Absent when the caller carries its own Authorization header; the client then adds none.
  send: (request: RawRequest, token: string | undefined) => Promise<Result<RawResponse, string>>;
}>;

export const createRawMapi = (
  params: Readonly<{ logger: Logger; adapter?: HttpAdapter }>,
): RawMapi => ({
  send: async (request, token) =>
    executeRawRequest(createMapiRawClient({ ...params, token }), request, params.logger),
});

const createMapiRawClient = (
  params: Readonly<{
    logger: Logger;
    token?: string | undefined;
    adapter?: HttpAdapter;
  }>,
): MapiRawClient => {
  const requestHeaders =
    params.token === undefined
      ? [createSdkIdHeader(cliSdkInfo)]
      : [createSdkIdHeader(cliSdkInfo), { name: "Authorization", value: `Bearer ${params.token}` }];

  return {
    requestHeaders,
    httpService: getDefaultHttpService({
      requestHeaders,
      ...(params.adapter === undefined ? {} : { adapter: params.adapter }),
      retryStrategy: {
        maxRetries: MAX_RETRY_ATTEMPTS,
        maxRetryDelayMs: MAX_RETRY_DELAY_MS,
        // 429 is the only status core-sdk retries, and leaving `canRetryAdapterError`
        // at its default keeps it that way - so a non-idempotent call is never sent twice.
        logRetryAttempt: (retryAttempt, _url, retryInMs) =>
          params.logger.warning(
            "standard",
            `Rate limited (429). Retrying in ${retryInMs} ms (attempt ${retryAttempt}/${MAX_RETRY_ATTEMPTS}).`,
          ),
      },
    }),
  };
};

/**
 * Sends the request and hands back whatever came off the wire. A 4xx/5xx is a
 * result, not an error - only a request that could not be made at all fails.
 */
const executeRawRequest = async (
  client: MapiRawClient,
  request: RawRequest,
  logger: Logger,
): Promise<Result<RawResponse, string>> => {
  logger.info("verbose", formatTrace(request, [...client.requestHeaders, ...request.headers]));

  const response = await client.httpService.request<JsonValue, Blob | null>({
    url: request.url,
    method: request.method,
    body: request.body,
    requestHeaders: request.headers,
    ...(request.abortSignal === undefined ? {} : { abortSignal: request.abortSignal }),
  });

  if (response.success) {
    return ok(toRawResponse(response.response.adapterResponse));
  }
  return fromSdkError(response.error);
};

/**
 * core-sdk reports every non-2xx as an error; for this command most of them are
 * the answer. Only the reasons that mean no answer arrived stay errors.
 */
const fromSdkError = (error: KontentSdkError): Result<RawResponse, string> =>
  match(error.details)
    .returnType<Result<RawResponse, string>>()
    .with(
      { reason: P.union("unauthorized", "notFound", "invalidResponse") },
      ({ adapterResponse }) =>
        adapterResponse === undefined ? err(error.message) : ok(toRawResponse(adapterResponse)),
    )
    .with({ reason: "aborted" }, () => err("The request was aborted."))
    .with({ reason: "parseError" }, () => err("The response could not be parsed as JSON."))
    // core-sdk's own message only points at the wrapped error; the cause is what the user can act on.
    .with({ reason: "adapterError" }, ({ originalError }) => err(errorMessage(originalError)))
    .otherwise(() => err(error.message));

// A Blob payload is unreachable here - only `downloadFile` produces one, and it
// widens the shared response type - but narrowing beats asserting it away.
const toRawResponse = (response: AdapterResponse<AdapterPayload>): RawResponse => ({
  status: response.status,
  statusText: response.statusText,
  responseHeaders: response.responseHeaders,
  payload: response.payload instanceof Blob ? null : response.payload,
});

const formatTrace = (request: RawRequest, headers: ReadonlyArray<Header>): string => {
  const headerLines = headers.map(
    (header) =>
      `  ${header.name}: ${header.name.toLowerCase() === "authorization" ? "<redacted>" : header.value}`,
  );
  return [`${request.method} ${request.url.toString()}`, ...headerLines].join("\n");
};
