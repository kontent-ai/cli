import {
  AdapterAbortError,
  AdapterParseError,
  type AdapterResponse,
  createSdkIdHeader,
  getDefaultHttpAdapter,
  type Header,
  type HttpAdapter,
  type HttpMethod,
  type JsonValue,
  type SdkInfo,
} from "@kontent-ai/core-sdk";

// biome-ignore lint/correctness/useImportExtensions: JSON imports must keep the .json extension
import pkg from "../../../../package.json" with { type: "json" };
import type { Logger } from "../../../log.js";
import { kontentManagementUrl } from "../../config/kontentUrl.js";
import { err, isErr, type Result, tryAsync } from "../../result.js";

const MAX_RETRY_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY_MS = 1000;
const TOO_MANY_REQUESTS = 429;

const mapiSdkInfo: SdkInfo = {
  name: pkg.name,
  version: pkg.version,
  host: "npmjs.com",
};

/**
 * A passthrough transport for the Management API: no schema, no response
 * interpretation. The typed, validated counterpart is `src/lib/mapi/client.ts`.
 */
export type MapiRawClient = Readonly<{
  baseUrl: string;
  // Absent when the caller carries its own Authorization header; the client then adds none.
  token?: string | undefined;
  adapter: HttpAdapter;
  sdkInfo: SdkInfo;
}>;

export type RawRequest = Readonly<{
  url: URL;
  method: HttpMethod;
  headers: ReadonlyArray<Header>;
  body: string | Blob | null;
  abortSignal?: AbortSignal;
}>;

export const createMapiRawClient = (
  params: Readonly<{ token?: string | undefined; baseUrl?: string; adapter?: HttpAdapter }>,
): MapiRawClient => ({
  baseUrl: params.baseUrl ?? kontentManagementUrl(),
  token: params.token,
  adapter: params.adapter ?? getDefaultHttpAdapter(),
  sdkInfo: mapiSdkInfo,
});

/**
 * Sends the request and hands back whatever came off the wire. A 4xx/5xx is a
 * result, not an error - only a request that could not be made at all fails.
 * Retries 429 (which means the request was rejected, never executed) and nothing
 * else, so a non-idempotent call is never sent twice.
 */
export const executeRawRequest = async (
  client: MapiRawClient,
  request: RawRequest,
  logger: Logger,
): Promise<Result<AdapterResponse<JsonValue>, string>> => {
  const executeRequest = client.adapter.executeRequest;
  if (executeRequest === undefined) {
    return err("The configured HTTP adapter cannot execute requests.");
  }

  const requestHeaders = mergeHeaders(
    client.token === undefined
      ? [createSdkIdHeader(client.sdkInfo)]
      : [
          createSdkIdHeader(client.sdkInfo),
          { name: "Authorization", value: `Bearer ${client.token}` },
        ],
    request.headers,
  );
  logger.info("verbose", formatTrace(request, requestHeaders));

  const send = async (attempt: number): Promise<Result<AdapterResponse<JsonValue>, string>> => {
    const response = await tryAsync(
      async () =>
        executeRequest({
          url: request.url,
          method: request.method,
          body: request.body,
          requestHeaders,
          abortSignal: request.abortSignal,
        }),
      describeTransportError,
    );

    if (isErr(response) || response.value.status !== TOO_MANY_REQUESTS) {
      return response;
    }

    if (attempt >= MAX_RETRY_ATTEMPTS) {
      return response;
    }

    const delayMs = retryAfterMs(response.value.responseHeaders);
    logger.warning(
      "standard",
      `Rate limited (429). Retrying in ${delayMs} ms (attempt ${attempt + 1}/${MAX_RETRY_ATTEMPTS}).`,
    );
    await delay(delayMs);
    return await send(attempt + 1);
  };

  return await send(0);
};

/**
 * `Retry-After` comes in two legal forms: delta-seconds or an HTTP-date. Both are
 * honored; anything absent or unparseable falls back to a second rather than
 * retrying immediately. The clamp matters because a date already in the past - a
 * slow hop, a skewed clock - would otherwise produce a negative delay.
 */
export const retryAfterMs = (headers: ReadonlyArray<Header>): number => {
  const raw = headers.find((header) => header.name.toLowerCase() === "retry-after")?.value.trim();
  if (raw === undefined) {
    return DEFAULT_RETRY_DELAY_MS;
  }

  const seconds = Number(raw);
  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1000);
  }

  const dateMs = Date.parse(raw);
  if (Number.isNaN(dateMs)) {
    return DEFAULT_RETRY_DELAY_MS;
  }
  return Math.max(0, dateMs - Date.now());
};

// Names are canonicalized to lowercase - what fetch (and HTTP/2) put on the wire
// anyway - so the merged set is deterministic regardless of the caller's casing.
const mergeHeaders = (
  base: ReadonlyArray<Header>,
  overrides: ReadonlyArray<Header>,
): ReadonlyArray<Header> => [
  ...[...base, ...overrides]
    .reduce((merged, header) => {
      const name = header.name.toLowerCase();
      return merged.set(name, { name, value: header.value });
    }, new Map<string, Header>())
    .values(),
];

const formatTrace = (request: RawRequest, headers: ReadonlyArray<Header>): string => {
  const headerLines = headers.map(
    (header) =>
      `  ${header.name}: ${header.name.toLowerCase() === "authorization" ? "<redacted>" : header.value}`,
  );
  return [`${request.method} ${request.url.toString()}`, ...headerLines].join("\n");
};

const describeTransportError = (cause: unknown): string => {
  if (cause instanceof AdapterAbortError) {
    return "The request was aborted.";
  }
  if (cause instanceof AdapterParseError) {
    return "The response could not be parsed as JSON.";
  }
  if (cause instanceof Error) {
    return cause.message;
  }
  return String(cause);
};

const delay = async (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
