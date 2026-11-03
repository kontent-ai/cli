import type { JsonValue } from "@kontent-ai/core-sdk";
import { describe, expect, it } from "vitest";
import {
  createRawClient,
  type RawNextPage,
  type RawRequest,
  type RawResponse,
} from "../../src/cli/adapters/http/rawClient.js";
import { createLogger } from "../../src/cli/log.js";
import type { Result } from "../../src/core/lib/result.js";
import { assertErr, assertOk } from "../helpers/assertResult.js";
import { type HttpRoute, httpTestAdapter } from "../helpers/httpTestAdapter.js";

const ENV_ID = "11111111-2222-3333-4444-555555555555";
const BASE_URL = "https://deliver.test";

const request = (path: string): RawRequest => ({
  url: new URL(`${BASE_URL}/${ENV_ID}/${path}`),
  method: "GET",
  headers: [],
  body: null,
});

// The rule the workflow passes in, reduced to what these routes answer with.
const nextPage = (page: RawResponse): RawNextPage => {
  const token = page.responseHeaders.find((header) => header.name === "X-Continuation")?.value;
  if (token !== undefined) {
    return { continuationToken: token };
  }
  const payload = page.payload as { pagination?: { next_page?: string } } | null;
  const url = payload?.pagination?.next_page;
  return url === undefined || url === "" ? {} : { nextPageUrl: url };
};

const collect = async (
  routes: ReadonlyArray<HttpRoute>,
  path: string,
  maxPages?: number,
): Promise<
  Readonly<{
    pages: ReadonlyArray<Result<RawResponse, string>>;
    requests: ReturnType<typeof httpTestAdapter>["requests"];
  }>
> => {
  const { adapter, requests } = httpTestAdapter(routes);
  const client = createRawClient({ adapter, logger: createLogger("none") });
  const pages: Array<Result<RawResponse, string>> = [];
  for await (const page of client.pages(request(path), "secret-key", { maxPages, nextPage })) {
    pages.push(page);
  }
  return { pages, requests };
};

const payloadOf = (page: Result<RawResponse, string> | undefined): JsonValue => {
  if (page === undefined) {
    throw new Error("Missing page");
  }
  assertOk(page);
  return page.value.payload;
};

describe("createRawClient pages", () => {
  it("follows X-Continuation and sends the token back", async () => {
    const { pages, requests } = await collect(
      [
        {
          method: "GET",
          path: /\/items-feed$/,
          replies: [
            { payload: { items: [1] }, headers: [{ name: "X-Continuation", value: "token-2" }] },
            { payload: { items: [2] } },
          ],
        },
      ],
      "items-feed",
    );

    expect(pages.map(payloadOf)).toEqual([{ items: [1] }, { items: [2] }]);
    expect(requests[1]?.requestHeaders).toContainEqual({
      name: "X-Continuation",
      value: "token-2",
    });
    expect(requests[0]?.requestHeaders).toContainEqual({
      name: "Authorization",
      value: "Bearer secret-key",
    });
  });

  it("follows next_page URLs until the empty one", async () => {
    const next = `${BASE_URL}/${ENV_ID}/items?limit=1&skip=1`;
    const { pages, requests } = await collect(
      [
        {
          method: "GET",
          path: /\/items$/,
          replies: [
            { payload: { items: [1], pagination: { next_page: next } } },
            { payload: { items: [2], pagination: { next_page: "" } } },
          ],
        },
      ],
      "items?limit=1",
    );

    expect(pages).toHaveLength(2);
    expect(requests[1]?.url.toString()).toBe(next);
  });

  it("keeps the key on the requested host when next_page names another", async () => {
    const { requests } = await collect(
      [
        {
          method: "GET",
          path: /\/items$/,
          replies: [
            {
              payload: {
                items: [1],
                pagination: { next_page: `http://evil.test/${ENV_ID}/items?skip=1` },
              },
            },
            { payload: { items: [2], pagination: { next_page: "" } } },
          ],
        },
      ],
      "items?limit=1",
    );

    expect(requests[1]?.url.toString()).toBe(`${BASE_URL}/${ENV_ID}/items?skip=1`);
  });

  it("stops at maxPages", async () => {
    const { pages, requests } = await collect(
      [
        {
          method: "GET",
          path: /\/items-feed$/,
          replies: [
            { payload: { items: [] }, headers: [{ name: "X-Continuation", value: "more" }] },
          ],
        },
      ],
      "items-feed",
      2,
    );

    expect(pages).toHaveLength(2);
    expect(requests).toHaveLength(2);
  });

  it("yields a 4xx page as a response and ends there", async () => {
    const { pages, requests } = await collect(
      [
        {
          method: "GET",
          path: /\/items$/,
          replies: [{ status: 401, statusText: "Unauthorized", payload: { message: "No key" } }],
        },
      ],
      "items",
    );

    expect(pages).toHaveLength(1);
    const [page] = pages;
    if (page === undefined) {
      throw new Error("Missing page");
    }
    assertOk(page);
    expect(page.value.status).toBe(401);
    expect(page.value.payload).toEqual({ message: "No key" });
    expect(requests).toHaveLength(1);
  });

  it("yields a transport failure as an error", async () => {
    const { pages } = await collect(
      [{ method: "GET", path: /\/items$/, replies: [{ throws: new Error("socket hang up") }] }],
      "items",
    );

    const [page] = pages;
    if (page === undefined) {
      throw new Error("Missing page");
    }
    assertErr(page);
    expect(page.error).toContain("socket hang up");
  });
});
