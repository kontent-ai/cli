import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { errorMessage } from "../../../core/lib/error.js";
import { none, type Option, some } from "../../../core/lib/option.js";
import { err, ok, type Result, tryAsync } from "../../../core/lib/result.js";

/** Local files; a missing path is `none`, not an error. */
export type Files = Readonly<{
  entries: (dir: string) => Promise<Result<Option<ReadonlyArray<string>>, string>>;
  readText: (filePath: string) => Promise<Result<Option<string>, string>>;
  writeText: (filePath: string, text: string) => Promise<Result<void, string>>;
  /** Creates the folder and any missing parents; an existing folder is fine. */
  makeDir: (dir: string) => Promise<Result<void, string>>;
  /** An already missing file counts as removed. A folder is never removed. */
  removeFile: (filePath: string) => Promise<Result<void, string>>;
}>;

export const files: Files = {
  entries: async (dir) => missingAsNone(async () => readdir(dir)),
  readText: async (filePath) => missingAsNone(async () => readFile(filePath, "utf8")),
  writeText: async (filePath, text) =>
    tryAsync(async () => writeFile(filePath, text, "utf8"), errorMessage),
  makeDir: async (dir) =>
    tryAsync(async () => {
      await mkdir(dir, { recursive: true });
    }, errorMessage),
  removeFile: async (filePath) => tryAsync(async () => rm(filePath, { force: true }), errorMessage),
};

const missingAsNone = async <T>(read: () => Promise<T>): Promise<Result<Option<T>, string>> => {
  try {
    return ok(some(await read()));
  } catch (cause) {
    return isNoEnt(cause) ? ok(none) : err(errorMessage(cause));
  }
};

const isNoEnt = (cause: unknown): boolean =>
  typeof cause === "object" && cause !== null && "code" in cause && cause.code === "ENOENT";
