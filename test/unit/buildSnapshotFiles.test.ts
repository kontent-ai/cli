import { describe, expect, it } from "vitest";
import { err } from "../../src/core/lib/result.js";
import { snapshotFileText } from "../../src/core/snapshot/fileText.js";
import { snapshotKinds } from "../../src/core/snapshot/kinds.js";
import { buildSnapshotManifest } from "../../src/core/snapshot/manifest.js";
import { buildSnapshotFiles } from "../../src/core/snapshot/snapshotFiles.js";
import { assertOk } from "../helpers/assertResult.js";

const ENV_ID = "975bf280-fd91-488c-994c-2f04416e5ee3";
const LANGUAGE_ID = "6e3c0c8a-2d4b-4f53-9c1e-0a7b5d9e2f11";

const kind = (name: string) => {
  const found = snapshotKinds.find((k) => k.name === name);
  if (found === undefined) {
    throw new Error(`no kind ${name}`);
  }
  return found;
};

describe("buildSnapshotFiles", () => {
  it("writes each entity into its own file, with the manifest", () => {
    const environment = { id: ENV_ID, name: "Site" };
    const article = { id: "a1", codename: "article" };
    const language = { id: LANGUAGE_ID, codename: "default" };

    const result = buildSnapshotFiles(ENV_ID, [
      { kind: kind("environment"), entities: [environment] },
      { kind: kind("types"), entities: [article] },
      { kind: kind("languages"), entities: [language] },
      { kind: kind("workflows"), entities: [] },
    ]);

    assertOk(result);
    expect(result.value).toEqual({
      manifest: snapshotFileText(buildSnapshotManifest(ENV_ID)),
      files: [
        { path: ["environment.json"], text: snapshotFileText(environment) },
        { path: ["types", "article.json"], text: snapshotFileText(article) },
        { path: ["languages", `${LANGUAGE_ID}.json`], text: snapshotFileText(language) },
      ],
      omittedJsonParameters: 0,
    });
  });

  it("leaves the custom elements' json_parameters out of types and snippets, and counts them", () => {
    const picker = { id: "e1", codename: "picker", type: "custom", source_url: "https://p.test" };
    const withParameters = { ...picker, json_parameters: '{"apiKey":"secret"}' };

    const result = buildSnapshotFiles(ENV_ID, [
      {
        kind: kind("types"),
        entities: [{ id: "a1", codename: "article", elements: [withParameters] }],
      },
      {
        kind: kind("snippets"),
        entities: [{ id: "s1", codename: "seo", elements: [withParameters] }],
      },
    ]);

    assertOk(result);
    expect(result.value.omittedJsonParameters).toBe(2);
    expect(result.value.files).toEqual([
      {
        path: ["types", "article.json"],
        text: snapshotFileText({ id: "a1", codename: "article", elements: [picker] }),
      },
      {
        path: ["snippets", "seo.json"],
        text: snapshotFileText({ id: "s1", codename: "seo", elements: [picker] }),
      },
    ]);
  });

  it("names every kind holding an entity it can't name, once", () => {
    const result = buildSnapshotFiles(ENV_ID, [
      { kind: kind("types"), entities: [{ codename: "aux" }, { codename: "con" }] },
      { kind: kind("snippets"), entities: [{ id: "s1", codename: "seo" }] },
      { kind: kind("languages"), entities: [{ codename: "default" }] },
    ]);

    expect(result).toEqual(err({ kind: "no-safe-name", kindNames: ["types", "languages"] }));
  });
});
