import { readdir, readFile, writeFile } from "node:fs/promises";
import { errorMessage } from "../../../core/lib/error.js";
import { none, type Option, some } from "../../../core/lib/option.js";
import { err, ok, type Result, tryAsync } from "../../../core/lib/result.js";

/** Local files; a missing path is `none`, not an error. */
export type Files = Readonly<{
  entries: (dir: string) => Promise<Result<Option<ReadonlyArray<string>>, string>>;
  readText: (filePath: string) => Promise<Result<Option<string>, string>>;
  writeText: (filePath: string, text: string) => Promise<Result<void, string>>;
}>;

export const files: Files = {
  entries: async (dir) => missingAsNone(async () => readdir(dir)),
  readText: async (filePath) => missingAsNone(async () => readFile(filePath, "utf8")),
  writeText: async (filePath, text) =>
    tryAsync(async () => writeFile(filePath, text, "utf8"), errorMessage),
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
