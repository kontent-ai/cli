import { describe, expect, it } from "vitest";
import { planSpaceModifications } from "../../src/core/project/previewSpace.js";

const CONFIG = { rootItemCodename: "landing", collectionCodename: "default" };

describe("planSpaceModifications", () => {
  it("asks for nothing when the space has a root item and collections", () => {
    expect(
      planSpaceModifications({ id: "s", hasRootItem: true, hasCollections: true }, CONFIG),
    ).toEqual([]);
  });

  it("sets whatever the space is missing", () => {
    expect(
      planSpaceModifications({ id: "s", hasRootItem: false, hasCollections: false }, CONFIG),
    ).toEqual([
      { op: "replace", property_name: "root_item", value: { codename: "landing" } },
      { op: "replace", property_name: "collections", value: [{ codename: "default" }] },
    ]);
  });
});
