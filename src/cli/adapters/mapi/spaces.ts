import type { SpaceModels } from "@kontent-ai/management-sdk";
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
            // The SDK still types this field as `web_spotlight_root_item`; the API expects `root_item`.
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
        .withData(modifications as unknown as SpaceModels.IModifySpaceData[])
        .toPromise();
    }, mapiErrorMessage),
});
