import { isSome, none, type Option, some } from "../lib/option.js";
import { isEntityFile } from "./layout.js";

export type SnapshotFile = Readonly<{ path: ReadonlyArray<string>; text: string }>;

export type SnapshotFiles<Manifest> = Readonly<{
  manifest: Manifest;
  files: ReadonlyArray<SnapshotFile>;
}>;

export type WritePlan = Readonly<{
  /**
   * The new `manifest.json` text, written before anything else: an interrupted run then still
   * leaves a folder the next run recognises as a snapshot.
   */
  manifest: Option<string>;
  /** Independent of each other, so they can be applied in parallel. */
  writes: ReadonlyArray<SnapshotFile>;
  deletes: ReadonlyArray<ReadonlyArray<string>>;
}>;

/**
 * Only what changed: a file whose text is the same stays untouched, modified time included, so
 * build tools that compare timestamps see no change. A file that isn't an entity file is never
 * deleted, whatever the caller passes in.
 */
export const planSnapshotWrite = (
  next: SnapshotFiles<string>,
  current: SnapshotFiles<Option<string>>,
): WritePlan => {
  const currentFiles = current.files.filter((file) => isEntityFile(file.path));
  const currentTexts = new Map(currentFiles.map((file) => [pathKey(file.path), file.text]));
  const nextKeys = new Set(next.files.map((file) => pathKey(file.path)));

  return {
    manifest:
      isSome(current.manifest) && isSameText(current.manifest.value, next.manifest)
        ? none
        : some(next.manifest),
    writes: next.files.filter((file) => {
      const currentText = currentTexts.get(pathKey(file.path));
      return currentText === undefined || !isSameText(currentText, file.text);
    }),
    deletes: currentFiles
      .filter((file) => !nextKeys.has(pathKey(file.path)))
      .map((file) => file.path),
  };
};

// A lookup key, not an OS path: core can't join paths.
const pathKey = (path: ReadonlyArray<string>): string => path.join("/");

// Git with `core.autocrlf` checks files out with `\r\n`. The content is the same, so rewriting
// such a file would only touch its modified time on every run.
const isSameText = (currentText: string, nextText: string): boolean =>
  currentText.replaceAll("\r\n", "\n") === nextText;
