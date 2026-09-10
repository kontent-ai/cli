import * as z from "zod/mini";

import { createLearnQuery, type LearnClient, type LearnQueryParams } from "../client.js";

export const SearchResultSchema = z.record(z.string(), z.json());

export type SearchResult = z.infer<typeof SearchResultSchema>;

// The route answers with candidates ranked by score, empty when nothing matches.
export const SearchResponseSchema = z.object({ json: z.array(SearchResultSchema) });

export const search = (client: LearnClient, params: LearnQueryParams) =>
  createLearnQuery(client, "/search", params, SearchResponseSchema);
