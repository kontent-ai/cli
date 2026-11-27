import type { JsonObject } from "@kontent-ai/core-sdk";
import { combine, map, mapErr, type Result } from "../lib/result.js";
import { snapshotFileText } from "./fileText.js";
import { withoutJsonParameters } from "./jsonParameters.js";
import type { SnapshotKind } from "./kinds.js";
import { entityFilePath } from "./layout.js";
import { buildSnapshotManifest } from "./manifest.js";
import type { SnapshotFile, SnapshotFiles } from "./writePlan.js";

export type FetchedKind = Readonly<{ kind: SnapshotKind; entities: ReadonlyArray<JsonObject> }>;

export type SnapshotFilesError = Readonly<{
  kind: "no-safe-name";
  kindNames: ReadonlyArray<string>;
}>;

export type BuiltSnapshot = SnapshotFiles<string> &
  Readonly<{
    /** Custom elements whose `json_parameters` held a value and was left out. */
    omittedJsonParameters: number;
  }>;

/**
 * Every file of a snapshot of these entities, as text, with its manifest. No file holds a custom
 * element's `json_parameters`.
 */
export const buildSnapshotFiles = (
  environmentId: string,
  fetched: ReadonlyArray<FetchedKind>,
): Result<BuiltSnapshot, SnapshotFilesError> => {
  const trimmed = fetched.flatMap(({ kind, entities }) =>
    entities.map((entity) => ({ kind, ...withoutJsonParameters(entity) })),
  );

  return map(
    mapErr(
      combine(trimmed.map(({ kind, entity }) => toSnapshotFile(kind, entity))),
      (kindNames): SnapshotFilesError => ({
        kind: "no-safe-name",
        kindNames: [...new Set(kindNames)],
      }),
    ),
    (files) => ({
      manifest: snapshotFileText(buildSnapshotManifest(environmentId)),
      files,
      omittedJsonParameters: trimmed.reduce((sum, { omittedCount }) => sum + omittedCount, 0),
    }),
  );
};

const toSnapshotFile = (kind: SnapshotKind, entity: JsonObject): Result<SnapshotFile, string> =>
  mapErr(
    map(entityFilePath(kind.storedIn, entity), (path) => ({
      path,
      text: snapshotFileText(entity),
    })),
    () => kind.name,
  );
