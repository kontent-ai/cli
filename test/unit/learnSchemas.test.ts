import { describe, expect, it } from "vitest";
import * as z from "zod/mini";
import { EndpointDetailsResponseSchema } from "../../src/lib/learn/endpoints/endpointDetails.js";
import { ObjectDetailsResponseSchema } from "../../src/lib/learn/endpoints/objectDetails.js";
import { SearchResponseSchema } from "../../src/lib/learn/endpoints/search.js";

const candidate = {
  title: "Filter by taxonomy",
  docsUrl: "https://kontent.ai/learn/x",
  score: 0.42,
};

describe("learn response schemas", () => {
  it("accepts the JSON-RPC envelope the service wraps its answers in", () => {
    const result = z.safeParse(SearchResponseSchema, { json: [candidate] });

    expect(result.success).toBe(true);
  });

  it("accepts the ranked candidate list the detail routes answer with", () => {
    const endpointResult = z.safeParse(EndpointDetailsResponseSchema, {
      json: [candidate, candidate],
    });
    const objectResult = z.safeParse(ObjectDetailsResponseSchema, { json: [candidate] });

    expect(endpointResult.success).toBe(true);
    expect(objectResult.success).toBe(true);
  });

  it("accepts an empty candidate list from the detail routes", () => {
    const endpointResult = z.safeParse(EndpointDetailsResponseSchema, { json: [] });
    const objectResult = z.safeParse(ObjectDetailsResponseSchema, { json: [] });

    expect(endpointResult.success).toBe(true);
    expect(objectResult.success).toBe(true);
  });

  it("rejects a single detail object where a candidate list is expected", () => {
    const result = z.safeParse(EndpointDetailsResponseSchema, { json: candidate });

    expect(result.success).toBe(false);
  });

  it("rejects an envelope without the json array", () => {
    const result = z.safeParse(SearchResponseSchema, {});

    expect(result.success).toBe(false);
  });
});
