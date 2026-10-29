import type { PreviewSpaceConfig } from "./samples.js";

export const SPACE_NAME = "localhost";
export const SPACE_CODENAME = "localhost";
export const PREVIEW_PORT = 3000;
export const PREVIEW_DOMAIN = `localhost:${PREVIEW_PORT}`;

export type SpaceSummary = Readonly<{
  id: string;
  hasRootItem: boolean;
  hasCollections: boolean;
}>;

// The SDK still types the property as `web_spotlight_root_item`; the API expects `root_item`.
export type SpaceModification = Readonly<{
  op: "replace";
  property_name: "root_item" | "collections";
  value: unknown;
}>;

/** What an existing localhost space is missing; empty when it needs nothing. */
export const planSpaceModifications = (
  space: SpaceSummary,
  config: PreviewSpaceConfig,
): ReadonlyArray<SpaceModification> => [
  ...(space.hasRootItem
    ? []
    : [
        {
          op: "replace" as const,
          property_name: "root_item" as const,
          value: { codename: config.rootItemCodename },
        },
      ]),
  ...(space.hasCollections
    ? []
    : [
        {
          op: "replace" as const,
          property_name: "collections" as const,
          value: [{ codename: config.collectionCodename }],
        },
      ]),
];
