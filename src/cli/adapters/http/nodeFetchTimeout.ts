import type { KontentSdkError } from "@kontent-ai/core-sdk";
import { isMatching, P } from "ts-pattern";

export const NODE_FETCH_TIMEOUT_MESSAGE = "The server did not respond in time.";

/**
 * Whether core-sdk failed the request because Node's fetch gave up waiting. A headers
 * timeout fails fetch itself (adapterError); a body timeout fails reading the JSON body
 * (parseError).
 */
export const isNodeFetchTimeoutError = (details: KontentSdkError["details"]): boolean =>
  isMatching(
    { reason: P.union("adapterError", "parseError"), originalError: P.when(isNodeFetchTimeout) },
    details,
  );

/**
 * Whether Node's fetch gave up waiting: on the response headers, or on the next chunk of
 * body. undici reports both as a generic "fetch failed" or "terminated" TypeError with the
 * coded reason in `cause`; core-sdk may wrap that once more (AdapterParseError).
 */
export const isNodeFetchTimeout = (error: unknown): boolean => hasTimeoutInCauseChain(error, 0);

// Guards against a cause chain that loops back on itself.
const MAX_CAUSE_DEPTH = 5;

const hasTimeoutInCauseChain = (error: unknown, depth: number): boolean =>
  error instanceof Error &&
  depth < MAX_CAUSE_DEPTH &&
  (isMatching({ code: P.union("UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT") }, error) ||
    hasTimeoutInCauseChain(error.cause, depth + 1));
