import type { Header } from "@kontent-ai/core-sdk";
import { describe, expect, it } from "vitest";
import { decideDapiCredential } from "../../src/core/dapi/credential.js";
import { resolveDapiEndpoint } from "../../src/core/dapi/endpoint.js";
import { decideNextPage, decideResumePoint } from "../../src/core/dapi/nextPage.js";
import {
  type PagingState,
  type PagingStep,
  startPaging,
  stepPaging,
} from "../../src/core/dapi/paging.js";
import { buildDapiHeaders } from "../../src/core/dapi/request.js";
import { none, some } from "../../src/core/lib/option.js";
import { err, ok, type Result } from "../../src/core/lib/result.js";
import type { PassthroughResponse } from "../../src/core/passthrough/response.js";
import { assertErr, assertOk } from "../helpers/assertResult.js";

const ENV_ID = "11111111-2222-3333-4444-555555555555";
const BASE_URL = "https://deliver.kontent.ai";
const AUTH_HEADER = { name: "Authorization", value: "Bearer from-header" };

describe("decideDapiCredential", () => {
  it.each([
    {
      name: "an Authorization header wins over every key",
      headers: [AUTH_HEADER],
      dapiKey: "flag-key",
      envDapiKey: "env-key",
      isPreview: true,
      expected: ok({ source: "header" }),
    },
    {
      name: "--dapiKey wins over KONTENT_DAPI_KEY",
      headers: [],
      dapiKey: "flag-key",
      envDapiKey: "env-key",
      isPreview: false,
      expected: ok({ source: "dapi-key", key: "flag-key" }),
    },
    {
      name: "KONTENT_DAPI_KEY is used without the flag",
      headers: [],
      dapiKey: undefined,
      envDapiKey: "env-key",
      isPreview: true,
      expected: ok({ source: "dapi-key", key: "env-key" }),
    },
    {
      name: "an empty --dapiKey does not hide KONTENT_DAPI_KEY",
      headers: [],
      dapiKey: "",
      envDapiKey: "env-key",
      isPreview: false,
      expected: ok({ source: "dapi-key", key: "env-key" }),
    },
    {
      name: "an empty KONTENT_DAPI_KEY counts as none",
      headers: [],
      dapiKey: undefined,
      envDapiKey: "",
      isPreview: false,
      expected: ok({ source: "none" }),
    },
    {
      name: "production goes out without a key",
      headers: [],
      dapiKey: undefined,
      envDapiKey: undefined,
      isPreview: false,
      expected: ok({ source: "none" }),
    },
    {
      name: "preview without any key fails before sending",
      headers: [],
      dapiKey: undefined,
      envDapiKey: undefined,
      isPreview: true,
      expected: err({ kind: "missing-preview-key" }),
    },
  ] as const)("$name", ({ name: _name, expected, ...inputs }) => {
    expect(decideDapiCredential(inputs)).toEqual(expected);
  });
});

describe("resolveDapiEndpoint", () => {
  it.each([
    { endpoint: "items", expected: `${BASE_URL}/${ENV_ID}/items` },
    { endpoint: "/items", expected: `${BASE_URL}/${ENV_ID}/items` },
    { endpoint: "items?limit=10", expected: `${BASE_URL}/${ENV_ID}/items?limit=10` },
    { endpoint: "types/article", expected: `${BASE_URL}/${ENV_ID}/types/article` },
  ])("resolves $endpoint", ({ endpoint, expected }) => {
    const result = resolveDapiEndpoint(endpoint, { baseUrl: BASE_URL, envId: ENV_ID });

    assertOk(result);
    expect(result.value.toString()).toBe(expected);
  });

  it("names the Delivery API when rejecting an absolute URL", () => {
    const result = resolveDapiEndpoint("https://evil.example.com/items", {
      baseUrl: BASE_URL,
      envId: ENV_ID,
    });

    assertErr(result);
    expect(result.error.kind).toBe("absolute-url");
    expect(result.error.message).toContain("The host is always the Delivery API.");
  });
});

describe("buildDapiHeaders", () => {
  it("adds the wait header before the user's headers, so -H can override it", () => {
    const result = buildDapiHeaders({ header: ["X-Foo: 1"], isWaitingForNewContent: true });

    expect(result).toEqual(
      ok([
        { name: "X-KC-Wait-For-Loading-New-Content", value: "true" },
        { name: "X-Foo", value: "1" },
      ]),
    );
  });

  it("sends only the user's headers without the flag", () => {
    expect(buildDapiHeaders({ header: undefined, isWaitingForNewContent: false })).toEqual(ok([]));
  });

  it("rejects a malformed header", () => {
    const result = buildDapiHeaders({ header: ["no colon"], isWaitingForNewContent: false });

    assertErr(result);
    expect(result.error.kind).toBe("invalid-header");
  });
});

describe("decideNextPage", () => {
  const nextPageUrl = `${BASE_URL}/${ENV_ID}/items?limit=2&skip=2`;

  it.each([
    {
      name: "a continuation header (items-feed)",
      page: { payload: { items: [] }, headers: [{ name: "X-Continuation", value: "token-2" }] },
      expected: { kind: "continuation", token: "token-2" },
    },
    {
      name: "a next_page URL (listings)",
      page: { payload: { items: [], pagination: { next_page: nextPageUrl } }, headers: [] },
      expected: { kind: "url", url: nextPageUrl },
    },
    {
      name: "an empty next_page on the last page",
      page: { payload: { items: [], pagination: { next_page: "" } }, headers: [] },
      expected: { kind: "none" },
    },
    {
      name: "a relative next_page as none",
      page: { payload: { items: [], pagination: { next_page: `${ENV_ID}/items` } }, headers: [] },
      expected: { kind: "none" },
    },
    {
      name: "a single item with no pagination",
      page: { payload: { item: {}, modular_content: {} }, headers: [] },
      expected: { kind: "none" },
    },
  ] as const)("reads $name", ({ page, expected }) => {
    expect(decideNextPage(page)).toEqual(expected);
  });
});

describe("decideResumePoint", () => {
  it("keeps the starting endpoint with a continuation token", () => {
    expect(decideResumePoint({ kind: "continuation", token: "token-2" }, "items-feed")).toEqual({
      endpoint: "items-feed",
      continuationToken: "token-2",
    });
  });

  // Delivery lowercases the id in next_page, whatever casing --envId used.
  it("drops the environment segment of a next_page URL without comparing it", () => {
    expect(
      decideResumePoint(
        { kind: "url", url: `${BASE_URL}/${ENV_ID.toUpperCase()}/types/article?limit=2&skip=4` },
        "items?limit=2",
      ),
    ).toEqual({ endpoint: "types/article?limit=2&skip=4" });
  });
});

describe("stepPaging", () => {
  const PAYLOAD = { items: [] };
  const answer = (
    statusCode: number,
    headers: ReadonlyArray<Header> = [],
  ): PassthroughResponse => ({
    statusCode,
    statusText: "",
    headers,
    body: PAYLOAD,
  });
  const started = startPaging("items-feed", []);
  const afterOnePage: PagingState = {
    ...started,
    pageCount: 1,
    resume: { endpoint: "items-feed", continuationToken: "token-2" },
    hasMorePages: true,
  };

  const rows: ReadonlyArray<
    Readonly<{
      name: string;
      state: PagingState;
      page: Result<PassthroughResponse, string>;
      expected: PagingStep;
    }>
  > = [
    {
      name: "reads on from a page that has a next one",
      state: started,
      page: ok(answer(200, [{ name: "X-Continuation", value: "token-2" }])),
      expected: {
        kind: "continue",
        page: { payload: PAYLOAD, pageNumber: 1 },
        state: afterOnePage,
      },
    },
    {
      name: "reads on from the last page, leaving nothing to resume",
      state: afterOnePage,
      page: ok(answer(200)),
      expected: {
        kind: "continue",
        page: { payload: PAYLOAD, pageNumber: 2 },
        state: { ...afterOnePage, pageCount: 2, hasMorePages: false },
      },
    },
    {
      name: "ends on a 4xx first page, which is the answer",
      state: started,
      page: ok(answer(401)),
      expected: {
        kind: "end",
        page: none,
        end: { kind: "first-page-response", response: answer(401) },
      },
    },
    {
      name: "ends on a transport failure of the first page",
      state: started,
      page: err("socket hang up"),
      expected: {
        kind: "end",
        page: none,
        end: { kind: "first-page-transport", message: "socket hang up" },
      },
    },
    {
      name: "prints a later 5xx page's body and resumes at that page",
      state: afterOnePage,
      page: ok(answer(500)),
      expected: {
        kind: "end",
        page: some({ payload: PAYLOAD, pageNumber: 2 }),
        end: {
          kind: "page-failed",
          pageNumber: 2,
          reason: "HTTP 500",
          resume: afterOnePage.resume,
        },
      },
    },
    {
      name: "prints nothing for a later error page without a JSON body",
      state: afterOnePage,
      page: ok({ ...answer(502), body: null }),
      expected: {
        kind: "end",
        page: none,
        end: {
          kind: "page-failed",
          pageNumber: 2,
          reason: "HTTP 502",
          resume: afterOnePage.resume,
        },
      },
    },
    {
      name: "resumes at a later page that could not be fetched",
      state: afterOnePage,
      page: err("socket hang up"),
      expected: {
        kind: "end",
        page: none,
        end: {
          kind: "page-failed",
          pageNumber: 2,
          reason: "socket hang up",
          resume: afterOnePage.resume,
        },
      },
    },
  ];

  it.each(rows)("$name", ({ state, page, expected }) => {
    expect(stepPaging(state, page)).toEqual(expected);
  });
});
