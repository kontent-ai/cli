import type { JsonArray, JsonObject, JsonValue } from "@kontent-ai/core-sdk";
import { match } from "ts-pattern";
import { err, ok, type Result } from "../lib/result.js";
import type { ResponseShape } from "./kinds.js";

export type EntitiesError = Readonly<{ kind: "unexpected-shape" }>;

/**
 * The entities in one response page, as the API sent them. They are checked, not parsed:
 * a schema's output would drop unknown fields and reorder keys, and the snapshot keeps both.
 */
export const extractEntities = (
  shape: ResponseShape,
  body: JsonValue,
): Result<ReadonlyArray<JsonObject>, EntitiesError> =>
  match(shape)
    .returnType<Result<ReadonlyArray<JsonObject>, EntitiesError>>()
    .with({ kind: "wrapper" }, ({ key }) =>
      isJsonObject(body) ? toEntityList(body[key]) : err({ kind: "unexpected-shape" }),
    )
    .with({ kind: "array" }, () => toEntityList(body))
    .with({ kind: "entity" }, () =>
      isJsonObject(body) ? ok([body]) : err({ kind: "unexpected-shape" }),
    )
    .exhaustive();

const isJsonObject = (value: JsonValue): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const toEntityList = (value: JsonValue): Result<ReadonlyArray<JsonObject>, EntitiesError> =>
  isJsonArray(value) && value.every(isJsonObject) ? ok(value) : err({ kind: "unexpected-shape" });

const isJsonArray = (value: JsonValue): value is JsonArray => Array.isArray(value);
