import { describe, expect, it } from "vitest";
import { err, ok } from "../../src/core/lib/result.js";
import { entityFilePath } from "../../src/core/snapshot/layout.js";

const ID = "6e3c0c8a-2d4b-4f53-9c1e-0a7b5d9e2f11";

const TYPES = { kind: "folder", name: "types", namedBy: "codename" } as const;
const LANGUAGES = { kind: "folder", name: "languages", namedBy: "id" } as const;
const ENVIRONMENT = { kind: "file", name: "environment.json" } as const;

const TYPE_BY_ID = ok(["types", `${ID}.json`]);
const LANGUAGE_BY_ID = ok(["languages", `${ID}.json`]);
const NO_SAFE_NAME = err({ kind: "no-safe-name" });

describe("entityFilePath", () => {
  it.each([
    {
      name: "names a file by its codename",
      storedIn: TYPES,
      entity: { id: ID, codename: "article" },
      expected: ok(["types", "article.json"]),
    },
    {
      name: "keeps digits and underscores in a codename",
      storedIn: TYPES,
      entity: { id: ID, codename: "blog_post_2" },
      expected: ok(["types", "blog_post_2.json"]),
    },
    {
      name: "keeps a codename that only starts like a reserved name",
      storedIn: TYPES,
      entity: { id: ID, codename: "auxiliary" },
      expected: ok(["types", "auxiliary.json"]),
    },
    {
      name: "keeps com10, which Windows doesn't reserve",
      storedIn: TYPES,
      entity: { id: ID, codename: "com10" },
      expected: ok(["types", "com10.json"]),
    },
    ...["con", "prn", "aux", "nul", "com1", "com9", "lpt1", "lpt9"].map((codename) => ({
      name: `falls back to the id for the Windows reserved name ${codename}`,
      storedIn: TYPES,
      entity: { id: ID, codename },
      expected: TYPE_BY_ID,
    })),
    {
      name: "falls back to the id for a codename with capitals",
      storedIn: TYPES,
      entity: { id: ID, codename: "Article" },
      expected: TYPE_BY_ID,
    },
    {
      name: "falls back to the id when there's no codename",
      storedIn: TYPES,
      entity: { id: ID },
      expected: TYPE_BY_ID,
    },
    {
      name: "falls back to the id for an empty codename",
      storedIn: TYPES,
      entity: { id: ID, codename: "" },
      expected: TYPE_BY_ID,
    },
    {
      name: "falls back to the id for a codename that isn't a string",
      storedIn: TYPES,
      entity: { id: ID, codename: 42 },
      expected: TYPE_BY_ID,
    },
    {
      name: "names a language by its id even when the codename is safe",
      storedIn: LANGUAGES,
      entity: { id: ID, codename: "default" },
      expected: LANGUAGE_BY_ID,
    },
    {
      name: "names a language with a hyphenated codename by its id",
      storedIn: LANGUAGES,
      entity: { id: ID, codename: "fr-CH" },
      expected: LANGUAGE_BY_ID,
    },
    {
      name: "refuses an unsafe codename without an id",
      storedIn: TYPES,
      entity: { codename: "aux" },
      expected: NO_SAFE_NAME,
    },
    {
      name: "refuses a language without an id",
      storedIn: LANGUAGES,
      entity: { codename: "default" },
      expected: NO_SAFE_NAME,
    },
    {
      name: "refuses an id that isn't a GUID",
      storedIn: LANGUAGES,
      entity: { id: "../../outside", codename: "default" },
      expected: NO_SAFE_NAME,
    },
    {
      name: "puts a file kind's entity in its own file, whatever it holds",
      storedIn: ENVIRONMENT,
      entity: { id: ID, name: "Site", environment: "Production" },
      expected: ok(["environment.json"]),
    },
  ])("$name", ({ storedIn, entity, expected }) => {
    expect(entityFilePath(storedIn, entity)).toEqual(expected);
  });
});
