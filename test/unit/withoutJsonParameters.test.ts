import type { JsonObject } from "@kontent-ai/core-sdk";
import { describe, expect, it } from "vitest";
import { withoutJsonParameters } from "../../src/core/snapshot/jsonParameters.js";

const TEXT = { id: "e1", codename: "title", type: "text", name: "Title" };
const CUSTOM = {
  id: "e2",
  codename: "picker",
  type: "custom",
  source_url: "https://picker.test",
  json_parameters: '{"apiKey":"secret"}',
  name: "Picker",
};
const CUSTOM_TRIMMED = {
  id: "e2",
  codename: "picker",
  type: "custom",
  source_url: "https://picker.test",
  name: "Picker",
};

const entity = (elements: ReadonlyArray<JsonObject>): JsonObject => ({
  id: "t1",
  codename: "article",
  elements,
  last_modified: "2026-01-01",
});

describe("withoutJsonParameters", () => {
  it.each<Readonly<{ name: string; elements: ReadonlyArray<JsonObject>; omittedCount: number }>>([
    { name: "one custom element with a value", elements: [TEXT, CUSTOM], omittedCount: 1 },
    {
      name: "several custom elements with a value",
      elements: [CUSTOM, TEXT, { ...CUSTOM, id: "e3", codename: "second_picker" }],
      omittedCount: 2,
    },
    {
      name: "a custom element whose value is null, which isn't counted",
      elements: [{ ...CUSTOM, json_parameters: null }],
      omittedCount: 0,
    },
    {
      name: "a custom element whose value is an empty string",
      elements: [{ ...CUSTOM, json_parameters: "" }],
      omittedCount: 1,
    },
  ])("drops the field from $name", ({ elements, omittedCount }) => {
    const trimmed = withoutJsonParameters(entity(elements));

    expect(trimmed.omittedCount).toBe(omittedCount);
    expect(JSON.stringify(trimmed.entity)).not.toContain("json_parameters");
  });

  it("keeps every other field and the order of the keys", () => {
    const trimmed = withoutJsonParameters(entity([TEXT, CUSTOM]));

    expect(JSON.stringify(trimmed.entity)).toBe(JSON.stringify(entity([TEXT, CUSTOM_TRIMMED])));
  });

  it.each<Readonly<{ name: string; entity: JsonObject }>>([
    { name: "an entity without elements", entity: { id: "w1", codename: "default", steps: [] } },
    { name: "an entity whose elements aren't a list", entity: { id: "x1", elements: "none" } },
    { name: "a custom element without the field", entity: entity([TEXT, CUSTOM_TRIMMED]) },
    {
      name: "the same key on an element that isn't custom",
      entity: entity([{ ...TEXT, json_parameters: "kept" }]),
    },
    { name: "the same key on the entity itself", entity: { id: "x2", json_parameters: "kept" } },
  ])("returns $name as it was", ({ entity: untouched }) => {
    expect(withoutJsonParameters(untouched)).toEqual({ entity: untouched, omittedCount: 0 });
  });
});
