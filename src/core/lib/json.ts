import type { JsonArray, JsonObject, JsonValue } from "@kontent-ai/core-sdk";

export const isJsonObject = (value: JsonValue): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const isJsonArray = (value: JsonValue): value is JsonArray => Array.isArray(value);
