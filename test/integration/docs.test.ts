import type { BaseUrl, JsonValue } from "@kontent-ai/core-sdk";
import { describe, expect, it } from "vitest";
import { getEndpointDetails, getObjectDetails, searchDocs } from "../../src/core/docs/learn.js";
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
  docsUrl: `https://kontent.ai/learn/${title}`,
  body: "…",
  score: 0.5,
});

const run = (routes: ReadonlyArray<MapiRoute>) => {
  const { adapter, requests } = mapiTestAdapter(routes);
  return { deps: { logger, client: createLearnClient({ adapter, baseUrl: BASE_URL }) }, requests };
};

const endpointItem = (title: string) => ({
  title,
  docsUrl: `https://kontent.ai/learn/${title}`,
  httpMethod: "delete",
  apiReference: "content_management_api_v2",
  endpointUrls: ["https://manage.kontent.ai/v2/projects/{environment_id}/types/{type_identifier}"],
});

const objectItem = (title: string) => ({
  title,
  docsUrl: `https://kontent.ai/learn/${title}`,
  apiReference: "content_management_api_v2",
});

const route = (path: RegExp, payload: JsonValue): MapiRoute => ({
  method: "GET",
  path,
  replies: [{ payload }],
});

const searchRoute = (payload: JsonValue): MapiRoute => route(/^\/search$/, payload);

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

  it("keeps the candidates the detail route ranks, best first", async () => {
    const { deps } = run([
      route(/^\/endpoint-details$/, {
        json: [endpointItem("Add a content item"), endpointItem("Add a content type")],
      }),
    ]);

    const result = await getEndpointDetails({ query: "add a content type", limit: 2 }, deps);

    assertOk(result);
    expect(result.value.map((candidate) => candidate.title)).toEqual([
      "Add a content item",
      "Add a content type",
    ]);
  });

  it("reports no match when a route ranks nothing", async () => {
    const { deps } = run([
      route(/^\/object-details$/, { json: [] }),
      route(/^\/endpoint-details$/, { json: [] }),
      searchRoute({ json: [] }),
    ]);

    const objectResult = await getObjectDetails({ query: "flurble", limit: 1 }, deps);
    const endpointResult = await getEndpointDetails({ query: "flurble", limit: 1 }, deps);
    const searchResult = await searchDocs({ query: "flurble", limit: 10 }, deps);

    assertErr(objectResult);
    assertErr(endpointResult);
    assertErr(searchResult);
    expect(objectResult.error.kind).toBe("no-match");
    expect(endpointResult.error.kind).toBe("no-match");
    expect(endpointResult.error.message).toBe(
      'No endpoint matches "flurble". Try different wording, or run kontent docs search "flurble" to see what the docs cover.',
    );
    expect(searchResult.error.kind).toBe("no-match");
    expect(searchResult.error.message).toBe('No page matches "flurble". Try different wording.');

    const filteredSearchResult = await searchDocs(
      { query: "flurble", limit: 10, apiReference: "delivery_api" },
      deps,
    );

    assertErr(filteredSearchResult);
    expect(filteredSearchResult.error.message).toBe(
      'No page matches "flurble". Try different wording, or drop --api to include conceptual guides.',
    );
  });

  it("answers with an object candidate the caller can read", async () => {
    const { deps } = run([route(/^\/object-details$/, { json: [objectItem("Content type")] })]);

    const result = await getObjectDetails({ query: "content type", limit: 1 }, deps);

    assertOk(result);
    expect(result.value[0]?.docsUrl).toBe("https://kontent.ai/learn/Content type");
  });

  // The service answers 400 to an empty apiReference, so no filter must mean no key.
  it("leaves apiReference out of the url when no filter is asked for", async () => {
    const { deps, requests } = run([route(/^\/object-details$/, { json: [objectItem("Type")] })]);

    await getObjectDetails({ query: "text element", limit: 1, apiReference: undefined }, deps);

    expect(requests[0]?.url.toString()).toBe("https://learn.test/object-details?text=text+element");
  });
});
