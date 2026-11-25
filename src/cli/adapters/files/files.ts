import { randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  readdir,
  readFile,
  readlink,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { errorMessage } from "../../../core/lib/error.js";
import { none, type Option, some } from "../../../core/lib/option.js";
import { err, ok, type Result, tryAsync } from "../../../core/lib/result.js";

/** Local files; a missing path is `none`, not an error. */
export type Files = Readonly<{
  entries: (dir: string) => Promise<Result<Option<ReadonlyArray<string>>, string>>;
  readText: (filePath: string) => Promise<Result<Option<string>, string>>;
  writeText: (filePath: string, text: string) => Promise<Result<void, string>>;
  /**
   * Readable by the owner only (0600). Never leaves a truncated file behind, and a symlinked
   * path stays a symlink: the write lands on its target, created when the link dangles.
   */
  writeTextAtomic: (filePath: string, text: string) => Promise<Result<void, string>>;
}>;

export const files: Files = {
  entries: async (dir) => missingAsNone(async () => readdir(dir)),
  readText: async (filePath) => missingAsNone(async () => readFile(filePath, "utf8")),
  writeText: async (filePath, text) =>
    tryAsync(async () => writeFile(filePath, text, "utf8"), errorMessage),
  writeTextAtomic: async (filePath, text) =>
    tryAsync(async () => writeAtomic(filePath, text), errorMessage),
};

// Antivirus and indexers on Windows briefly lock a freshly written file; about 100 ms in total.
const renameRetryDelaysMs: ReadonlyArray<number> = [20, 30, 50];

export const renameWithRetry = async (
  renameFile: (from: string, to: string) => Promise<void>,
  from: string,
  to: string,
): Promise<void> => {
  for (const delayMs of renameRetryDelaysMs) {
    try {
      await renameFile(from, to);
      return;
    } catch (cause) {
      if (!hasErrorCode(cause, "EPERM", "EBUSY", "EACCES")) {
        throw cause;
      }
      await sleep(delayMs);
    }
  }
  await renameFile(from, to);
};

const missingAsNone = async <T>(read: () => Promise<T>): Promise<Result<Option<T>, string>> => {
  try {
    return ok(some(await read()));
  } catch (cause) {
    return isNoEnt(cause) ? ok(none) : err(errorMessage(cause));
  }
};

const isNoEnt = (cause: unknown): boolean => hasErrorCode(cause, "ENOENT");

const hasErrorCode = (cause: unknown, ...codes: ReadonlyArray<string>): boolean =>
  typeof cause === "object" &&
  cause !== null &&
  "code" in cause &&
  typeof cause.code === "string" &&
  codes.includes(cause.code);

const writeAtomic = async (filePath: string, text: string): Promise<void> => {
  const targetPath = await resolveWriteTarget(filePath);
  // Written beside the target and renamed over it, so the rename stays on one file system.
  const tempPath = `${targetPath}.${randomUUID()}.tmp`;
  try {
    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(tempPath, text, { encoding: "utf8", mode: 0o600 });
    await renameWithRetry(rename, tempPath, targetPath);
  } catch (cause) {
    await rm(tempPath, { force: true }).catch(() => {});
    throw cause;
  }
};

const resolveWriteTarget = async (filePath: string): Promise<string> => {
  try {
    return await realpath(filePath);
  } catch (cause) {
    if (!isNoEnt(cause)) {
      throw cause;
    }
  }
  // realpath fails the same way on a missing file and on a dangling link; only lstat tells them apart.
  return followDanglingLinks(filePath, maxSymlinkHops);
};

// Like the kernel's own limit, so a chain realpath would reject is rejected here too.
const maxSymlinkHops = 40;

const followDanglingLinks = async (filePath: string, hopsLeft: number): Promise<string> => {
  const stats = await lstat(filePath).catch(() => undefined);
  if (stats === undefined || !stats.isSymbolicLink()) {
    return filePath;
  }
  if (hopsLeft === 0) {
    throw new Error(`Too many levels of symbolic links at ${filePath}`);
  }
  const target = path.resolve(path.dirname(filePath), await readlink(filePath));
  return followDanglingLinks(target, hopsLeft - 1);
};
