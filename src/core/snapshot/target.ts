import { match } from "ts-pattern";
import { z } from "zod/mini";
import type { Option } from "../lib/option.js";
import { fromThrowable, isOk } from "../lib/result.js";

/** What the `--path` folder holds before a snapshot is written into it. */
export type SnapshotTarget =
  | Readonly<{ kind: "missing" }>
  | Readonly<{ kind: "folder"; entries: ReadonlyArray<string>; manifestText: Option<string> }>;

export type SnapshotTargetDecision =
  | Readonly<{ kind: "create" }>
  | Readonly<{ kind: "replace" }>
  | Readonly<{ kind: "refuse"; reason: "has-other-files" | "foreign-manifest" }>;

/**
 * Writing a snapshot deletes whatever the target held, so only a folder that is missing, empty,
 * or a previous snapshot qualifies. A `manifest.json` proves a previous snapshot only when it is
 * a snapshot manifest: a web app's `public/` folder has one too.
 */
export const decideSnapshotTarget = (target: SnapshotTarget): SnapshotTargetDecision =>
  match(target)
    .returnType<SnapshotTargetDecision>()
    .with({ kind: "missing" }, () => ({ kind: "create" }))
    .with({ kind: "folder", manifestText: { kind: "some" } }, ({ manifestText }) =>
      isSnapshotManifest(manifestText.value)
        ? { kind: "replace" }
        : { kind: "refuse", reason: "foreign-manifest" },
    )
    .with({ kind: "folder", entries: [] }, () => ({ kind: "replace" }))
    .otherwise(() => ({ kind: "refuse", reason: "has-other-files" }));

const snapshotManifest = z.object({
  format_version: z.string(),
  environment_id: z.string(),
  kinds: z.array(z.string()),
});

const isSnapshotManifest = (text: string): boolean => {
  const json = fromThrowable(
    (): unknown => JSON.parse(text),
    () => undefined,
  );
  return isOk(json) && snapshotManifest.safeParse(json.value).success;
};
