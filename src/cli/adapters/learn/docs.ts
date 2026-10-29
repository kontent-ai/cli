import type { BaseUrl, FetchQuery, HttpAdapter, JsonValue } from "@kontent-ai/core-sdk";
import { err, ok, type Result } from "../../../core/lib/result.js";
import type { Logger } from "../../log.js";
import { createLearnClient, type LearnQueryParams } from "./client.js";
import { type EndpointDetails, endpointDetails } from "./endpoints/endpointDetails.js";
import { type ObjectDetails, objectDetails } from "./endpoints/objectDetails.js";
import { type SearchResult, search } from "./endpoints/search.js";
import { formatLearnError } from "./formatLearnError.js";

/** Kontent.ai Learn: docs and API reference, ranked candidates best first. */
export type Docs = Readonly<{
  search: (query: LearnQueryParams) => Promise<Result<ReadonlyArray<SearchResult>, string>>;
  endpointDetails: (
    query: LearnQueryParams,
  ) => Promise<Result<ReadonlyArray<EndpointDetails>, string>>;
  objectDetails: (query: LearnQueryParams) => Promise<Result<ReadonlyArray<ObjectDetails>, string>>;
}>;

export const createDocs = (
  params: Readonly<{ logger: Logger; adapter?: HttpAdapter; baseUrl?: BaseUrl }>,
): Docs => {
  const client = createLearnClient({
    ...(params.adapter === undefined ? {} : { adapter: params.adapter }),
    ...(params.baseUrl === undefined ? {} : { baseUrl: params.baseUrl }),
  });
  return {
    search: async (query) => fetchDocs(params.logger, search(client, query)),
    endpointDetails: async (query) => fetchDocs(params.logger, endpointDetails(client, query)),
    objectDetails: async (query) => fetchDocs(params.logger, objectDetails(client, query)),
  };
};

const fetchDocs = async <T extends JsonValue>(
  logger: Logger,
  fetchQuery: FetchQuery<{ readonly json: T }>,
): Promise<Result<T, string>> => {
  // A url the SDK cannot resolve costs only the trace line, never the request.
  const inspected = fetchQuery.inspect();
  if (inspected.success) {
    logger.info("verbose", `GET ${inspected.data.url.toString()}`);
  }

  const result = await fetchQuery.fetchSafe();
  if (!result.success) {
    return err(formatLearnError(result.error));
  }

  // The service wraps every answer in a JSON-RPC envelope; the payload is what the caller asked for.
  return ok(result.response.payload.json);
};
