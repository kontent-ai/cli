import { z } from "zod/mini";
import { fromThrowable, isOk } from "../lib/result.js";
import { snapshotKinds } from "./kinds.js";

export const manifestFileName = "manifest.json";

/** `manifest.json`. Nothing in it changes between runs, so an unchanged environment gives no diff. */
export type SnapshotManifest = Readonly<{
  format_version: string;
  environment_id: string;
  management_api_version: string;
  kinds: ReadonlyArray<string>;
}>;

const formatVersion = "1.0";

export const buildSnapshotManifest = (environmentId: string): SnapshotManifest => ({
  format_version: formatVersion,
  environment_id: environmentId,
  management_api_version: "v2",
  kinds: snapshotKinds.map((kind) => kind.name),
});

const snapshotManifestSchema = z.object({
  format_version: z.string(),
  environment_id: z.string(),
  kinds: z.array(z.string()),
});

export const isSnapshotManifest = (text: string): boolean => {
  const json = fromThrowable(
    (): unknown => JSON.parse(text),
    () => undefined,
  );
  return isOk(json) && snapshotManifestSchema.safeParse(json.value).success;
};
