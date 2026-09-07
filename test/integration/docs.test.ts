import type { BaseUrl, JsonValue } from "@kontent-ai/core-sdk";
import { describe, expect, it } from "vitest";
import { searchDocs } from "../../src/core/docs/learn.js";
import { createLearnClient } from "../../src/lib/learn/client.js";
import { createLogger } from "../../src/log.js";
import { assertErr, assertOk } from "../helpers/assertResult.js";
import { type MapiRoute, mapiTestAdapter } from "../helpers/mapiTestAdapter.js";

const BASE_URL: BaseUrl = { protocol: "https", host: "learn.test" };

const logger = createLogger("none");

const searchItem = (title: string) => ({
  title,
  codename: title.toLowerCase().replaceAll(" ", "_"),
  type: "section",
  url: `https://kontent.ai/learn/${title}`,
  body: "…",
  score: 0.5,
});

const run = (routes: ReadonlyArray<MapiRoute>) => {
  const { adapter, requests } = mapiTestAdapter(routes);
  return { deps: { logger, client: createLearnClient({ adapter, baseUrl: BASE_URL }) }, requests };
};

const searchRoute = (payload: JsonValue): MapiRoute => ({
  method: "GET",
  path: /^\/search$/,
  replies: [{ payload }],
});

describe("docs queries", () => {
  it("sends the trimmed query as the text parameter and unwraps the envelope", async () => {
    const { deps, requests } = run([searchRoute({ json: [searchItem("Taxonomy")] })]);

    const result = await searchDocs({ query: "  taxonomy  ", limit: 10 }, deps);

    assertOk(result);
    expect(result.value).toEqual([searchItem("Taxonomy")]);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url.toString()).toBe("https://learn.test/search?text=taxonomy");
  });

  it("keeps only the requested number of results", async () => {
    const { deps } = run([
      searchRoute({ json: [searchItem("One"), searchItem("Two"), searchItem("Three")] }),
    ]);

    const result = await searchDocs({ query: "taxonomy", limit: 2 }, deps);

    assertOk(result);
    expect(result.value.map((item) => item.title)).toEqual(["One", "Two"]);
  });

  // The schema declares only what the CLI reads; core-sdk hands back the raw payload,
  // so anything the service adds still reaches stdout.
  it("passes fields the schema does not declare through to the caller", async () => {
    const { deps } = run([
      searchRoute({ json: [{ ...searchItem("Taxonomy"), somethingNew: "kept" }] }),
    ]);

    const result = await searchDocs({ query: "taxonomy", limit: 10 }, deps);

    assertOk(result);
    expect(result.value[0]).toHaveProperty("somethingNew", "kept");
  });

  it("rejects a blank query before any request goes out", async () => {
    const { deps, requests } = run([searchRoute({ json: [] })]);

    const result = await searchDocs({ query: "   ", limit: 10 }, deps);

    assertErr(result);
    expect(result.error.kind).toBe("empty-query");
    expect(requests).toHaveLength(0);
  });

  it("reports a failing status as a failed request", async () => {
    const { deps } = run([
      {
        method: "GET",
        path: /^\/search$/,
        replies: [
          {
            status: 400,
            statusText: "Bad Request",
            payload: { json: { error: { message: "Invalid or missing 'text'." } } },
          },
        ],
      },
    ]);

    const result = await searchDocs({ query: "taxonomy", limit: 10 }, deps);

    assertErr(result);
    expect(result.error.kind).toBe("request-failed");
    expect(result.error.message).toContain("400 Bad Request");
  });
});
