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

export type SpaceModification =
  | Readonly<{ kind: "set-root-item"; codename: string }>
  | Readonly<{ kind: "set-collections"; codenames: ReadonlyArray<string> }>;

/** What an existing localhost space is missing; empty when it needs nothing. */
export const planSpaceModifications = (
  space: SpaceSummary,
  config: PreviewSpaceConfig,
): ReadonlyArray<SpaceModification> => [
  ...(space.hasRootItem
    ? []
    : [{ kind: "set-root-item" as const, codename: config.rootItemCodename }]),
  ...(space.hasCollections
    ? []
    : [{ kind: "set-collections" as const, codenames: [config.collectionCodename] }]),
];
