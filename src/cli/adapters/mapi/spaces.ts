import type { SpaceModels } from "@kontent-ai/management-sdk";
import { match } from "ts-pattern";
import { type Result, tryAsync } from "../../../core/lib/result.js";
import type { SpaceModification, SpaceSummary } from "../../../core/project/previewSpace.js";
import type { MapiClient } from "./client.js";
import { mapiErrorMessage } from "./error.js";

export type SpaceRecord = SpaceSummary & Readonly<{ codename: string }>;

export type NewSpace = Readonly<{
  name: string;
  codename: string;
  rootItemCodename: string;
  collectionCodename: string;
}>;

export type Spaces = Readonly<{
  list: () => Promise<Result<ReadonlyArray<SpaceRecord>, string>>;
  create: (space: NewSpace) => Promise<Result<string, string>>;
  modify: (
    spaceId: string,
    modifications: ReadonlyArray<SpaceModification>,
  ) => Promise<Result<void, string>>;
}>;

// The SDK still types the root item as `web_spotlight_root_item`; the API expects `root_item`,
// hence the casts in `create` and `modify`.
export const createSpaces = (client: MapiClient): Spaces => ({
  list: async () =>
    tryAsync(
      async () =>
        (await client.listSpaces().toPromise()).data.map((space) => ({
          id: space.id,
          codename: space.codename,
          // Absent root item / collections come back as `null` (not missing), so guard against both.
          hasRootItem:
            space.webSpotlightRootItem !== undefined && space.webSpotlightRootItem !== null,
          hasCollections: (space.collections?.length ?? 0) > 0,
        })),
      mapiErrorMessage,
    ),
  create: async (space) =>
    tryAsync(
      async () =>
        (
          await client
            .addSpace()
            .withData({
              name: space.name,
              codename: space.codename,
              root_item: { codename: space.rootItemCodename },
              collections: [{ codename: space.collectionCodename }],
            } as unknown as SpaceModels.IAddSpaceData)
            .toPromise()
        ).data.id,
      mapiErrorMessage,
    ),
  modify: async (spaceId, modifications) =>
    tryAsync(async () => {
      await client
        .modifySpace()
        .bySpaceId(spaceId)
        .withData(modifications.map(toModifySpaceData) as unknown as SpaceModels.IModifySpaceData[])
        .toPromise();
    }, mapiErrorMessage),
});

const toModifySpaceData = (modification: SpaceModification) =>
  match(modification)
    .with({ kind: "set-root-item" }, (m) => ({
      op: "replace" as const,
      property_name: "root_item" as const,
      value: { codename: m.codename },
    }))
    .with({ kind: "set-collections" }, (m) => ({
      op: "replace" as const,
      property_name: "collections" as const,
      value: m.codenames.map((codename) => ({ codename })),
    }))
    .exhaustive();
