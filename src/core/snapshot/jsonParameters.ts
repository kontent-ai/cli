import type { JsonObject, JsonValue } from "@kontent-ai/core-sdk";
import { isJsonArray, isJsonObject } from "../lib/json.js";

export type TrimmedEntity = Readonly<{
  entity: JsonObject;
  /** Custom elements whose `json_parameters` held a value. */
  omittedCount: number;
}>;

/**
 * The entity without its custom elements' `json_parameters`: free-form configuration that can
 * hold API keys, in a folder meant to be committed. Everything else stays, key order included.
 */
export const withoutJsonParameters = (entity: JsonObject): TrimmedEntity => {
  const { elements } = entity;
  if (!isJsonArray(elements) || !elements.some(hasJsonParameters)) {
    return { entity, omittedCount: 0 };
  }

  return {
    entity: {
      ...entity,
      elements: elements.map((element) =>
        hasJsonParameters(element) ? withoutKey(element, jsonParametersKey) : element,
      ),
    },
    omittedCount: elements.filter(
      (element) => hasJsonParameters(element) && element[jsonParametersKey] !== null,
    ).length,
  };
};

const jsonParametersKey = "json_parameters";

const hasJsonParameters = (element: JsonValue): element is JsonObject =>
  isJsonObject(element) && element.type === "custom" && jsonParametersKey in element;

const withoutKey = (object: JsonObject, key: string): JsonObject =>
  Object.fromEntries(Object.entries(object).filter(([name]) => name !== key));
