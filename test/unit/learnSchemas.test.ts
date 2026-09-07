import { describe, expect, it } from "vitest";
import * as z from "zod/mini";
import { SearchResponseSchema } from "../../src/lib/learn/endpoints/search.js";

const searchItem = {
  title: "Filter by taxonomy",
  codename: "filter_by_taxonomy",
  type: "section",
  url: "https://kontent.ai/learn/x",
  body: "…",
  score: 0.42,
};

describe("learn response schemas", () => {
  it("accepts the JSON-RPC envelope the service wraps its answers in", () => {
    const result = z.safeParse(SearchResponseSchema, { json: [searchItem] });

    expect(result.success).toBe(true);
  });

  it("rejects an item missing a field the CLI relies on", () => {
    const { title: _title, ...withoutTitle } = searchItem;
    const result = z.safeParse(SearchResponseSchema, { json: [withoutTitle] });

    expect(result.success).toBe(false);
  });
});
