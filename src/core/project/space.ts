import type { PreviewContracts, SpaceModels } from "@kontent-ai/management-sdk";
import { mapiErrorMessage } from "../../lib/error.js";
import type { MapiClient } from "../../lib/mapi/client.js";
import { isErr, ok, type Result, tryAsync } from "../../lib/result.js";
import type { PreviewSpaceConfig } from "./samples.js";

const SPACE_NAME = "localhost";
const SPACE_CODENAME = "localhost";
export const PREVIEW_PORT = 3000;
const PREVIEW_DOMAIN = `localhost:${PREVIEW_PORT}`;

const ENV_MACRO_SEGMENT = "/envid/{EnvironmentId}";

export type SpaceSetupError = Readonly<{
  kind: "space-failed" | "preview-failed";
  message: string;
}>;

export type SpaceSetupResult = Readonly<{
  previewDomain: string;
  wasSet: boolean;
}>;

type SpaceSummary = Readonly<{
  id: string;
  hasRootItem: boolean;
  hasCollections: boolean;
}>;

type SpaceLookup = Readonly<{
  match: SpaceSummary | undefined;
  spaceIds: readonly string[];
}>;

export const ensureLocalhostSpace = async (
  mapiClient: MapiClient,
  config: PreviewSpaceConfig,
): Promise<Result<SpaceSetupResult, SpaceSetupError>> => {
  const lookup = await findSpace(mapiClient, SPACE_CODENAME);
  if (isErr(lookup)) {
    return lookup;
  }
  const { match, spaceIds } = lookup.value;

  const spaceId =
    match !== undefined
      ? await ensureSpaceRootAndCollection(mapiClient, match, config)
      : await createSpace(mapiClient, SPACE_NAME, SPACE_CODENAME, config);
  if (isErr(spaceId)) {
    return spaceId;
  }

  return ensurePreviewConfiguration(mapiClient, spaceId.value, PREVIEW_DOMAIN, spaceIds);
};

const findSpace = async (
  client: MapiClient,
  codename: string,
): Promise<Result<SpaceLookup, SpaceSetupError>> =>
  tryAsync(
    async () => {
      const spaces = (await client.listSpaces().toPromise()).data;
      const found = spaces.find((space) => space.codename === codename);
      // Absent root item / collections come back as `null` (not missing), so guard against both.
      const match =
        found === undefined
          ? undefined
          : {
              id: found.id,
              hasRootItem:
                found.webSpotlightRootItem !== undefined && found.webSpotlightRootItem !== null,
              hasCollections: (found.collections?.length ?? 0) > 0,
            };
      return { match, spaceIds: spaces.map((space) => space.id) };
    },
    (cause) => ({ kind: "space-failed", message: mapiErrorMessage(cause) }),
  );

const createSpace = async (
  client: MapiClient,
  name: string,
  codename: string,
  config: PreviewSpaceConfig,
): Promise<Result<string, SpaceSetupError>> =>
  tryAsync(
    async () =>
      (
        await client
          .addSpace()
          // The SDK still types this field as `web_spotlight_root_item`; the API expects `root_item`.
          .withData({
            name,
            codename,
            root_item: { codename: config.rootItemCodename },
            collections: [{ codename: config.collectionCodename }],
          } as unknown as SpaceModels.IAddSpaceData)
          .toPromise()
      ).data.id,
    (cause) => ({ kind: "space-failed", message: mapiErrorMessage(cause) }),
  );

const ensureSpaceRootAndCollection = async (
  client: MapiClient,
  space: SpaceSummary,
  config: PreviewSpaceConfig,
): Promise<Result<string, SpaceSetupError>> => {
  // The SDK still types the property as `web_spotlight_root_item`; the API expects `root_item`.
  const rootItemOps = space.hasRootItem
    ? []
    : [{ op: "replace", property_name: "root_item", value: { codename: config.rootItemCodename } }];
  const collectionOps = space.hasCollections
    ? []
    : [
        {
          op: "replace",
          property_name: "collections",
          value: [{ codename: config.collectionCodename }],
        },
      ];
  const ops = [...rootItemOps, ...collectionOps] as unknown as SpaceModels.IModifySpaceData[];

  if (ops.length === 0) {
    return ok(space.id);
  }

  const modified = await tryAsync(
    async () => {
      await client.modifySpace().bySpaceId(space.id).withData(ops).toPromise();
      return space.id;
    },
    (cause): SpaceSetupError => ({ kind: "space-failed", message: mapiErrorMessage(cause) }),
  );
  return modified;
};

const ensurePreviewConfiguration = async (
  client: MapiClient,
  spaceId: string,
  domain: string,
  existingSpaceIds: readonly string[],
): Promise<Result<SpaceSetupResult, SpaceSetupError>> =>
  tryAsync(
    async () => {
      const current = (await client.getPreviewConfiguration().toPromise()).data._raw;

      // modifyPreviewConfiguration is a full-document PUT that validates every space reference, so a
      // reference to a deleted space (e.g. a prior localhost space) left in the config would reject
      // the whole request. Keep only references to spaces that still exist before sending it back.
      const liveSpaceIds = new Set([...existingSpaceIds, spaceId]);

      const existing = current.space_domains.find((entry) => entry.space.id === spaceId);
      const hasDomain = existing !== undefined && existing.domain !== "";

      const ourEntry = { space: { id: spaceId }, domain };
      const keptDomains = current.space_domains.filter((entry) => liveSpaceIds.has(entry.space.id));
      const spaceDomains =
        existing !== undefined
          ? keptDomains.map((entry) =>
              entry.space.id === spaceId && !hasDomain ? ourEntry : entry,
            )
          : [...keptDomains, ourEntry];

      const keptPatterns = current.preview_url_patterns.map((patterns) => ({
        ...patterns,
        url_patterns: patterns.url_patterns.filter(
          (pattern) => pattern.space === null || liveSpaceIds.has(pattern.space.id),
        ),
      }));

      await client
        .modifyPreviewConfiguration()
        .withData({
          space_domains: spaceDomains,
          preview_url_patterns: keptPatterns.map((patterns) =>
            withLocalhostPattern(patterns, spaceId),
          ),
        })
        .toPromise();

      return { previewDomain: hasDomain ? existing.domain : domain, wasSet: !hasDomain };
    },
    (cause) => ({ kind: "preview-failed", message: mapiErrorMessage(cause) }),
  );

const withLocalhostPattern = (
  patterns: PreviewContracts.IPreviewUrlPatternsContract,
  spaceId: string,
): PreviewContracts.IPreviewUrlPatternsContract => {
  const source =
    patterns.url_patterns.find((pattern) => pattern.space === null) ?? patterns.url_patterns[0];
  if (source === undefined) {
    return patterns;
  }

  const localhostUrl = source.url_pattern.replace(ENV_MACRO_SEGMENT, "");
  const others = patterns.url_patterns.filter((pattern) => pattern.space?.id !== spaceId);
  return {
    ...patterns,
    url_patterns: [...others, { space: { id: spaceId }, url_pattern: localhostUrl }],
  };
};
