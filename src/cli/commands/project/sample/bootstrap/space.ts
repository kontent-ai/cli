import { isErr, mapErr, ok, type Result } from "../../../../../core/lib/result.js";
import {
  type PreviewDomainDecision,
  planPreviewConfiguration,
} from "../../../../../core/project/previewConfiguration.js";
import {
  PREVIEW_DOMAIN,
  planSpaceModifications,
  SPACE_CODENAME,
  SPACE_NAME,
} from "../../../../../core/project/previewSpace.js";
import type { PreviewSpaceConfig } from "../../../../../core/project/samples.js";
import type { PreviewConfigurationStore } from "../../../../adapters/mapi/previewConfiguration.js";
import type { SpaceRecord, Spaces } from "../../../../adapters/mapi/spaces.js";

export type SpaceSetupError = Readonly<{
  kind: "space-failed" | "preview-failed";
  message: string;
}>;

export const ensureLocalhostSpace = async (
  effects: Readonly<{ spaces: Spaces; previewConfiguration: PreviewConfigurationStore }>,
  config: PreviewSpaceConfig,
): Promise<Result<PreviewDomainDecision, SpaceSetupError>> => {
  const listed = mapErr(await effects.spaces.list(), spaceFailed);
  if (isErr(listed)) {
    return listed;
  }
  const found = listed.value.find((space) => space.codename === SPACE_CODENAME);

  const spaceId = mapErr(
    found === undefined
      ? await effects.spaces.create({
          name: SPACE_NAME,
          codename: SPACE_CODENAME,
          rootItemCodename: config.rootItemCodename,
          collectionCodename: config.collectionCodename,
        })
      : await modifySpace(effects.spaces, found, config),
    spaceFailed,
  );
  if (isErr(spaceId)) {
    return spaceId;
  }

  const current = mapErr(await effects.previewConfiguration.read(), previewFailed);
  if (isErr(current)) {
    return current;
  }
  const plan = planPreviewConfiguration(current.value, {
    spaceId: spaceId.value,
    domain: PREVIEW_DOMAIN,
    existingSpaceIds: listed.value.map((space) => space.id),
  });

  const written = mapErr(
    await effects.previewConfiguration.write(plan.configuration),
    previewFailed,
  );
  if (isErr(written)) {
    return written;
  }
  return ok(plan.domainDecision);
};

const spaceFailed = (message: string): SpaceSetupError => ({ kind: "space-failed", message });

const modifySpace = async (
  spaces: Spaces,
  space: SpaceRecord,
  config: PreviewSpaceConfig,
): Promise<Result<string, string>> => {
  const modifications = planSpaceModifications(space, config);
  if (modifications.length === 0) {
    return ok(space.id);
  }
  const modified = await spaces.modify(space.id, modifications);
  return isErr(modified) ? modified : ok(space.id);
};

const previewFailed = (message: string): SpaceSetupError => ({ kind: "preview-failed", message });
