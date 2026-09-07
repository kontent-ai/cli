import * as z from "zod/mini";

import { createLearnQuery, type LearnClient } from "../client.js";

// Only the fields the CLI reads are declared: core-sdk hands back the raw payload,
// so everything else the service returns rides through to stdout untouched.
export const SearchResultSchema = z.object({
  title: z.string(),
  codename: z.string(),
  type: z.string(),
  url: z.string(),
  body: z.string(),
  score: z.number(),
});

export type SearchResult = z.infer<typeof SearchResultSchema>;

export const SearchResponseSchema = z.object({ json: z.array(SearchResultSchema) });

export const search = (client: LearnClient, text: string) =>
  createLearnQuery(client, "/search", text, SearchResponseSchema);
