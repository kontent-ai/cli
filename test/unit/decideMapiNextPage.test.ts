import { describe, expect, it } from "vitest";
import { none, some } from "../../src/core/lib/option.js";
import { decideMapiNextPage } from "../../src/core/mapi/nextPage.js";

const NEXT_PAGE_URL =
  "https://manage.kontent.ai/v2/projects/11111111-2222-3333-4444-555555555555/types";

describe("decideMapiNextPage", () => {
  it.each([
    {
      name: "the continuation token of a page with a next page",
      payload: {
        types: [],
        pagination: { continuation_token: "token-2", next_page: NEXT_PAGE_URL },
      },
      expected: some("token-2"),
    },
    {
      name: "a null continuation token as the last page",
      payload: { types: [], pagination: { continuation_token: null, next_page: null } },
      expected: none,
    },
    {
      name: "a null next_page as the last page, whatever the token",
      payload: { types: [], pagination: { continuation_token: "token-2", next_page: null } },
      expected: none,
    },
    {
      name: "a null token as the last page, whatever the next_page",
      payload: { types: [], pagination: { continuation_token: null, next_page: NEXT_PAGE_URL } },
      expected: none,
    },
    {
      name: "an empty continuation token as the last page",
      payload: { types: [], pagination: { continuation_token: "", next_page: NEXT_PAGE_URL } },
      expected: none,
    },
    {
      name: "a listing without pagination (collections) as the only page",
      payload: { collections: [], last_modified: "2026-11-18T10:00:00.000Z" },
      expected: none,
    },
    {
      name: "a bare array (workflows) as the only page",
      payload: [{ id: "00000000-0000-0000-0000-000000000000", codename: "default" }],
      expected: none,
    },
  ] as const)("reads $name", ({ payload, expected }) => {
    expect(decideMapiNextPage(payload)).toEqual(expected);
  });
});
