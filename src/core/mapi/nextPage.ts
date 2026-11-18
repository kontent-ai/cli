import type { JsonValue } from "@kontent-ai/core-sdk";
import { z } from "zod/mini";
import { none, type Option, some } from "../lib/option.js";

const paginatedPayload = z.object({
  pagination: z.object({
    continuation_token: z.string().check(z.minLength(1)),
    next_page: z.string().check(z.minLength(1)),
  }),
});

/**
 * The continuation token of the page after this one, sent back in the `x-continuation` header.
 * A `null` (or empty) `continuation_token` or `next_page` marks the last page, and a response
 * without `pagination` (collections, workflows) is the only page.
 */
export const decideMapiNextPage = (payload: JsonValue): Option<string> => {
  const parsed = paginatedPayload.safeParse(payload);
  return parsed.success ? some(parsed.data.pagination.continuation_token) : none;
};
