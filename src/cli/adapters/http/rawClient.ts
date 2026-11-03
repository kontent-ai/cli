import {
  type AdapterPayload,
  type AdapterRequestOptions,
  type AdapterResponse,
  createPagedFetchQuery,
  createSdkIdHeader,
  getDefaultHttpAdapter,
  getDefaultHttpService,
  type Header,
  type HttpAdapter,
  type HttpMethod,
  type HttpService,
  type JsonValue,
  jsonValueSchema,
  type KontentSdkError,
  type QueryResponse,
} from "@kontent-ai/core-sdk";
import { match, P } from "ts-pattern";
import { errorMessage } from "../../../core/lib/error.js";
import { err, ok, type Result } from "../../../core/lib/result.js";
import type { Logger } from "../../log.js";
import { cliSdkInfo } from "./sdkInfo.js";

const MAX_RETRY_ATTEMPTS = 3;
// Past this the API is rationing quota, not smoothing a burst. core-sdk clamps a
// longer `Retry-After` to the cap rather than giving up, so a rationing 429 costs
// at most MAX_RETRY_ATTEMPTS waits of this length before the status reaches the caller.
const MAX_RETRY_DELAY_MS = 60_000;

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

/** Where the page after a given one comes from; neither set means it was the last. */
export type RawNextPage = Readonly<{ continuationToken?: string; nextPageUrl?: string }>;

export type RawPagingOptions = Readonly<{
  maxPages: number | undefined;
  nextPage: (page: RawResponse) => RawNextPage;
}>;

/** What a workflow is handed: one call per request, sent with that request's credential. */
export type RawClient = Readonly<{
  // Absent when the caller carries its own Authorization header; the client then adds none.
  send: (
    request: RawRequest,
    bearerToken: string | undefined,
  ) => Promise<Result<RawResponse, string>>;
  /**
   * GET pages one by one, following `nextPage`, until the last page, `maxPages`, or the
   * first page that is not a 2xx: that one is yielded too, then the iteration ends.
   */
  pages: (
    request: RawRequest,
    bearerToken: string | undefined,
    options: RawPagingOptions,
  ) => AsyncIterable<Result<RawResponse, string>>;
}>;

/**
 * A passthrough client for the Kontent.ai REST APIs: no schema, no response
 * interpretation. The typed, validated Management API counterpart is
 * `src/cli/adapters/mapi/client.ts`.
 *
 * core-sdk's http service parses `application/json` and hands back a null payload
 * for anything else, which is all this needs: the APIs answer JSON on every status,
 * and binary only ever travels request-side, on a Management API asset upload.
 */
export const createRawClient = (
  params: Readonly<{ logger: Logger; adapter?: HttpAdapter }>,
): RawClient => ({
  send: async (request, bearerToken) =>
    executeRawRequest(createRawHttpService({ ...params, bearerToken }), request),
  pages: (request, bearerToken, options) =>
    iterateRawPages(createRawHttpService({ ...params, bearerToken }), request, options),
});

const createRawHttpService = (
  params: Readonly<{
    logger: Logger;
    bearerToken?: string | undefined;
    adapter?: HttpAdapter;
  }>,
): HttpService =>
  getDefaultHttpService({
    requestHeaders:
      params.bearerToken === undefined
        ? [createSdkIdHeader(cliSdkInfo)]
        : [
            createSdkIdHeader(cliSdkInfo),
            { name: "Authorization", value: `Bearer ${params.bearerToken}` },
          ],
    adapter: tracingAdapter(params.adapter, params.logger),
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
  });

// The adapter receives every request, retries and pages included, with the URL and the
// merged headers core-sdk actually sends, so the verbose trace shows what goes on the wire.
const tracingAdapter = (adapter: HttpAdapter | undefined, logger: Logger): HttpAdapter => {
  const executeRequest = adapter?.executeRequest ?? getDefaultHttpAdapter().executeRequest;

  return {
    ...adapter,
    executeRequest: async (options) => {
      logger.info("verbose", formatTrace(options));
      return await executeRequest(options);
    },
  };
};

const formatTrace = (request: AdapterRequestOptions): string => {
  const headerLines = (request.requestHeaders ?? []).map(
    (header) =>
      `  ${header.name}: ${header.name.toLowerCase() === "authorization" ? "<redacted>" : header.value}`,
  );
  return [`${request.method} ${request.url.toString()}`, ...headerLines].join("\n");
};

/**
 * Sends the request and hands back whatever came off the wire. A 4xx/5xx is a
 * result, not an error - only a request that could not be made at all fails.
 */
const executeRawRequest = async (
  httpService: HttpService,
  request: RawRequest,
): Promise<Result<RawResponse, string>> => {
  const response = await httpService.request<JsonValue, Blob | null>({
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
 * core-sdk's paging loop over the same http service, so pages get the retries and the
 * 4xx/5xx handling of a single request.
 */
async function* iterateRawPages(
  httpService: HttpService,
  request: RawRequest,
  options: RawPagingOptions,
): AsyncIterable<Result<RawResponse, string>> {
  const query = createPagedFetchQuery({
    url: request.url,
    requestHeaders: request.headers,
    config: {
      httpService,
      // next_page comes from the response body; the key must never follow it off the host it was sent to.
      baseUrl: {
        protocol: request.url.protocol === "http:" ? "http" : "https",
        host: request.url.host,
      },
    },
    schema: jsonValueSchema,
    sdkInfo: cliSdkInfo,
    mapError: (error: KontentSdkError) => error,
    mapMetadata: (response) => ({ statusText: response.adapterResponse.statusText }),
    mapExtraResponseProps: () => ({}),
    mapPagingExtraResponseProps: () => ({}),
    getNextPageData: (page) => options.nextPage(fromQueryResponse(page)),
  });

  for await (const page of query.pagesSafe({ maxPagesCount: options.maxPages })) {
    yield page.success ? ok(fromQueryResponse(page.response)) : fromSdkError(page.error);
  }
}

const fromQueryResponse = (
  page: QueryResponse<JsonValue, Readonly<{ statusText: string }>>,
): RawResponse => ({
  status: page.meta.status,
  statusText: page.meta.statusText,
  responseHeaders: page.meta.responseHeaders,
  payload: page.payload,
});

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
