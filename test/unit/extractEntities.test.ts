import { describe, expect, it } from "vitest";
import { err, ok } from "../../src/core/lib/result.js";
import { extractEntities } from "../../src/core/snapshot/entities.js";

const ARTICLE = { id: "a1", name: "Article", codename: "article", elements: [] };
const PAGE = { id: "p1", name: "Page", codename: "page", elements: [] };
const PAGINATION = { continuation_token: null, next_page: null };

const TYPES = { kind: "wrapper", key: "types" } as const;
const COLLECTIONS = { kind: "wrapper", key: "collections" } as const;
const ARRAY = { kind: "array" } as const;
const ENTITY = { kind: "entity" } as const;

const UNEXPECTED = err({ kind: "unexpected-shape" });

describe("extractEntities", () => {
  it.each([
    {
      name: "takes the list under the wrapper key",
      shape: TYPES,
      body: { types: [ARTICLE, PAGE], pagination: PAGINATION },
      expected: ok([ARTICLE, PAGE]),
    },
    {
      name: "takes an empty list under the wrapper key",
      shape: TYPES,
      body: { types: [], pagination: PAGINATION },
      expected: ok([]),
    },
    {
      name: "leaves the wrapper's other fields behind",
      shape: COLLECTIONS,
      body: { collections: [{ id: "c1", codename: "default" }], last_modified: "2026-01-01" },
      expected: ok([{ id: "c1", codename: "default" }]),
    },
    {
      name: "takes a bare array",
      shape: ARRAY,
      body: [{ id: "w1", codename: "default" }],
      expected: ok([{ id: "w1", codename: "default" }]),
    },
    {
      name: "takes a single object as the one entity",
      shape: ENTITY,
      body: { id: "e1", name: "Site", environment: "Production", is_production: true },
      expected: ok([{ id: "e1", name: "Site", environment: "Production", is_production: true }]),
    },
    {
      name: "refuses a wrapper without its key",
      shape: TYPES,
      body: { pagination: PAGINATION },
      expected: UNEXPECTED,
    },
    {
      name: "refuses a wrapper key that holds an object",
      shape: TYPES,
      body: { types: ARTICLE },
      expected: UNEXPECTED,
    },
    {
      name: "refuses a list holding something other than objects",
      shape: TYPES,
      body: { types: [ARTICLE, "page"] },
      expected: UNEXPECTED,
    },
    {
      name: "refuses null where a wrapper belongs",
      shape: TYPES,
      body: null,
      expected: UNEXPECTED,
    },
    {
      name: "refuses an array where a wrapper belongs",
      shape: TYPES,
      body: [ARTICLE],
      expected: UNEXPECTED,
    },
    {
      name: "refuses an object where an array belongs",
      shape: ARRAY,
      body: {},
      expected: UNEXPECTED,
    },
    { name: "refuses null inside an array", shape: ARRAY, body: [null], expected: UNEXPECTED },
    { name: "refuses an array as the one entity", shape: ENTITY, body: [], expected: UNEXPECTED },
    {
      name: "refuses a string as the one entity",
      shape: ENTITY,
      body: "Site",
      expected: UNEXPECTED,
    },
  ] as const)("$name", ({ shape, body, expected }) => {
    expect(extractEntities(shape, body)).toEqual(expected);
  });

  it("returns the objects it was given, not copies", () => {
    const result = extractEntities(TYPES, { types: [ARTICLE], pagination: PAGINATION });

    expect(result.kind === "ok" && result.value[0]).toBe(ARTICLE);
  });
});
