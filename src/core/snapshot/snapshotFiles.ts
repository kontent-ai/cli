import type { JsonObject } from "@kontent-ai/core-sdk";
import { combine, map, mapErr, type Result } from "../lib/result.js";
import { snapshotFileText } from "./fileText.js";
import type { SnapshotKind } from "./kinds.js";
import { entityFilePath } from "./layout.js";
import { buildSnapshotManifest } from "./manifest.js";
import type { SnapshotFile, SnapshotFiles } from "./writePlan.js";

export type FetchedKind = Readonly<{ kind: SnapshotKind; entities: ReadonlyArray<JsonObject> }>;

export type SnapshotFilesError = Readonly<{
  kind: "no-safe-name";
  kindNames: ReadonlyArray<string>;
}>;

/** Every file of a snapshot of these entities, as text, with its manifest. */
export const buildSnapshotFiles = (
  environmentId: string,
  fetched: ReadonlyArray<FetchedKind>,
): Result<SnapshotFiles<string>, SnapshotFilesError> =>
  map(
    mapErr(
      combine(
        fetched.flatMap(({ kind, entities }) =>
          entities.map((entity) => toSnapshotFile(kind, entity)),
        ),
      ),
      (kindNames): SnapshotFilesError => ({
        kind: "no-safe-name",
        kindNames: [...new Set(kindNames)],
      }),
    ),
    (files) => ({ manifest: snapshotFileText(buildSnapshotManifest(environmentId)), files }),
  );

const toSnapshotFile = (kind: SnapshotKind, entity: JsonObject): Result<SnapshotFile, string> =>
  mapErr(
    map(entityFilePath(kind.storedIn, entity), (path) => ({
      path,
      text: snapshotFileText(entity),
    })),
    () => kind.name,
  );
