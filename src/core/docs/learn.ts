import type { FetchQuery, JsonValue } from "@kontent-ai/core-sdk";
import type { LearnClient } from "../../lib/learn/client.js";
import {
  type EndpointDetails,
  endpointDetails,
} from "../../lib/learn/endpoints/endpointDetails.js";
import { type ObjectDetails, objectDetails } from "../../lib/learn/endpoints/objectDetails.js";
import { type SearchResult, search } from "../../lib/learn/endpoints/search.js";
import { formatLearnError } from "../../lib/learn/formatLearnError.js";
import { err, map, ok, type Result } from "../../lib/result.js";
import type { Logger } from "../../log.js";

/**
 * The service answers a query or it does not: a non-2xx carries no result worth
 * showing, so unlike `mapi` every failed status is an error rather than a value.
 */
export type DocsError =
  | Readonly<{ kind: "empty-query"; message: string }>
  | Readonly<{ kind: "request-failed"; message: string }>;

export type DocsDeps = Readonly<{ logger: Logger; client: LearnClient }>;

export const searchDocs = async (
  params: Readonly<{ query: string; limit: number }>,
  deps: DocsDeps,
): Promise<Result<ReadonlyArray<SearchResult>, DocsError>> =>
  map(await fetchDocs(deps, params.query, search), (results) => results.slice(0, params.limit));

export const getEndpointDetails = async (
  params: Readonly<{ query: string }>,
  deps: DocsDeps,
): Promise<Result<EndpointDetails, DocsError>> =>
  await fetchDocs(deps, params.query, endpointDetails);

export const getObjectDetails = async (
  params: Readonly<{ query: string }>,
  deps: DocsDeps,
): Promise<Result<ObjectDetails, DocsError>> => await fetchDocs(deps, params.query, objectDetails);

const fetchDocs = async <T extends JsonValue>(
  deps: DocsDeps,
  query: string,
  makeQuery: (client: LearnClient, text: string) => FetchQuery<{ readonly json: T }>,
): Promise<Result<T, DocsError>> => {
  const text = query.trim();
  if (text === "") {
    return err({
      kind: "empty-query",
      message:
        'A query is required. Pass a non-empty query, e.g. kontent docs search "upsert language variant".',
    });
  }

  const fetchQuery = makeQuery(deps.client, text);
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
