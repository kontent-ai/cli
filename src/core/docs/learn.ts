import type { FetchQuery, JsonValue } from "@kontent-ai/core-sdk";
import type { ApiReference } from "../../lib/learn/apiReference.js";
import type { LearnClient, LearnQueryParams } from "../../lib/learn/client.js";
import {
  type EndpointDetails,
  endpointDetails,
} from "../../lib/learn/endpoints/endpointDetails.js";
import { type ObjectDetails, objectDetails } from "../../lib/learn/endpoints/objectDetails.js";
import { type SearchResult, search } from "../../lib/learn/endpoints/search.js";
import { formatLearnError } from "../../lib/learn/formatLearnError.js";
import { err, flatMap, ok, type Result } from "../../lib/result.js";
import type { Logger } from "../../log.js";

/**
 * The service answers a query or it does not: a non-2xx carries no result worth
 * showing, so unlike `mapi` every failed status is an error rather than a value.
 */
export type DocsError =
  | Readonly<{ kind: "empty-query"; message: string }>
  | Readonly<{ kind: "no-match"; message: string }>
  | Readonly<{ kind: "request-failed"; message: string }>;

export type DocsDeps = Readonly<{ logger: Logger; client: LearnClient }>;

export type DocsParams = Readonly<{
  query: string;
  limit: number;
  apiReference?: ApiReference;
}>;

export const searchDocs = async (
  params: DocsParams,
  deps: DocsDeps,
): Promise<Result<ReadonlyArray<SearchResult>, DocsError>> =>
  takeBest(await fetchDocs(deps, params, search), "page", params, searchAgainHint(params));

export const getEndpointDetails = async (
  params: DocsParams,
  deps: DocsDeps,
): Promise<Result<ReadonlyArray<EndpointDetails>, DocsError>> =>
  takeBest(
    await fetchDocs(deps, params, endpointDetails),
    "endpoint",
    params,
    runSearchHint(params),
  );

export const getObjectDetails = async (
  params: DocsParams,
  deps: DocsDeps,
): Promise<Result<ReadonlyArray<ObjectDetails>, DocsError>> =>
  takeBest(await fetchDocs(deps, params, objectDetails), "object", params, runSearchHint(params));

const fetchDocs = async <T extends JsonValue>(
  deps: DocsDeps,
  params: DocsParams,
  makeQuery: (client: LearnClient, query: LearnQueryParams) => FetchQuery<{ readonly json: T }>,
): Promise<Result<T, DocsError>> => {
  const text = params.query.trim();
  if (text === "") {
    return err({
      kind: "empty-query",
      message:
        'A query is required. Pass a non-empty query, e.g. kontent docs search "upsert language variant".',
    });
  }

  const fetchQuery = makeQuery(deps.client, { text, apiReference: params.apiReference });
  // A url the SDK cannot resolve costs only the trace line, never the request.
  const inspected = fetchQuery.inspect();
  if (inspected.success) {
    deps.logger.info("verbose", `GET ${inspected.data.url.toString()}`);
  }

  const result = await fetchQuery.fetchSafe();
  if (!result.success) {
    return err({ kind: "request-failed", message: formatLearnError(result.error) });
  }

  // The service wraps every answer in a JSON-RPC envelope; the payload is what the caller asked for.
  return ok(result.response.payload.json);
};

const takeBest = <T>(
  result: Result<ReadonlyArray<T>, DocsError>,
  subject: string,
  params: DocsParams,
  hint: string,
): Result<ReadonlyArray<T>, DocsError> =>
  flatMap(result, (candidates) => {
    if (candidates.length === 0) {
      return err({
        kind: "no-match",
        message: `No ${subject} matches "${params.query}". ${hint}`,
      });
    }

    return ok(candidates.slice(0, params.limit));
  });

// search is the command an agent would otherwise be told to run for a no-match on
// search itself, so its hint points at dropping the filter instead of circling back.
const searchAgainHint = (params: DocsParams): string =>
  params.apiReference === undefined
    ? "Try different wording."
    : "Try different wording, or drop --api to include conceptual guides.";

const runSearchHint = (params: DocsParams): string =>
  `Try different wording, or run kontent docs search "${params.query}" to see what the docs cover.`;
