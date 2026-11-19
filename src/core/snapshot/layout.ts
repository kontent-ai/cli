import type { JsonObject, JsonValue } from "@kontent-ai/core-sdk";
import { match } from "ts-pattern";
import { isGuid } from "../lib/guid.js";
import { err, map, ok, type Result } from "../lib/result.js";
import type { FileNaming, StoredIn } from "./kinds.js";

export type EntityFileError = Readonly<{ kind: "no-safe-name" }>;

/**
 * Where an entity's file goes, as path pieces under the snapshot folder: core can't join
 * paths. In a folder named by codename, an entity gets `<codename>.json` when the codename is
 * a safe file name everywhere; every other entity gets `<id>.json`.
 */
export const entityFilePath = (
  storedIn: StoredIn,
  entity: JsonObject,
): Result<ReadonlyArray<string>, EntityFileError> =>
  match(storedIn)
    .returnType<Result<ReadonlyArray<string>, EntityFileError>>()
    .with({ kind: "file" }, ({ name }) => ok([name]))
    .with({ kind: "folder" }, ({ name, namedBy }) =>
      map(fileStem(namedBy, entity), (stem) => [name, `${stem}.json`]),
    )
    .exhaustive();

const fileStem = (namedBy: FileNaming, entity: JsonObject): Result<string, EntityFileError> => {
  const { codename, id } = entity;

  if (namedBy === "codename" && isSafeCodename(codename)) {
    return ok(codename);
  }

  if (isGuidString(id)) {
    return ok(id);
  }

  return err({ kind: "no-safe-name" });
};

const codenamePattern = /^[a-z0-9_]+$/;

// Windows reserves these device names in every folder and with any extension (`aux.json` is
// the AUX device), and Git for Windows refuses to check such a path out.
const windowsReservedNames: ReadonlySet<string> = new Set([
  "con",
  "prn",
  "aux",
  "nul",
  ...Array.from({ length: 9 }, (_, i) => `com${i + 1}`),
  ...Array.from({ length: 9 }, (_, i) => `lpt${i + 1}`),
]);

const isSafeCodename = (value: JsonValue): value is string =>
  typeof value === "string" && codenamePattern.test(value) && !windowsReservedNames.has(value);

const isGuidString = (value: JsonValue): value is string =>
  typeof value === "string" && isGuid(value);
