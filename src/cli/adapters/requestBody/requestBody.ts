import { openAsBlob } from "node:fs";
import { type FileHandle, open } from "node:fs/promises";
import type { Readable } from "node:stream";
import { blob } from "node:stream/consumers";
import { isatty } from "node:tty";
import { errorMessage } from "../../../core/lib/error.js";
import { err, isErr, type Result, tryAsync } from "../../../core/lib/result.js";

export type RequestBodyError = Readonly<{ kind: "unreadable-input"; message: string }>;

export type RequestBodyReader = Readonly<{
  // `input` is a path, or "-" for stdin.
  read: (input: string) => Promise<Result<Blob, RequestBodyError>>;
}>;

type Stdin = Readable & Readonly<{ isTTY?: boolean }>;

export const createRequestBodyReader = (stdin: Stdin): RequestBodyReader => ({
  read: async (input) => {
    if (input !== "-") {
      return await readFileInput(input);
    }

    // Without this guard the command would wait forever for input nobody is piping.
    if (stdin.isTTY === true) {
      return err({
        kind: "unreadable-input",
        message: "Nothing is piped to stdin. Pipe the body in, or pass --input <file>.",
      });
    }

    return await drain(stdin, "stdin");
  },
});

// A Blob has to know its length up front, so a regular file is the only source that can
// be handed to openAsBlob unread and streamed from disk at send time; everything else is
// drained into memory first. openAsBlob only stats the path it takes, reporting a missing
// one as a bare "Unable to open file as blob" and an unreadable one only once the body is
// read, with the request already out - opening the path first is what turns either into a
// real errno. openAsBlob takes a path, not a descriptor, so the probe handle is closed and
// the path is opened a second time; a swap or chmod between the two opens is accepted.
const readFileInput = async (input: string): Promise<Result<Blob, RequestBodyError>> => {
  const label = `"${input}"`;
  const toError = unreadable(label);

  const opened = await tryAsync(async () => await open(input, "r"), toError);
  if (isErr(opened)) {
    return opened;
  }
  const handle = opened.value;

  const stats = await tryAsync(async () => await handle.stat(), toError);
  if (isErr(stats)) {
    await closeQuietly(handle);
    return stats;
  }

  // A directory opens fine read-only on POSIX, so only the stat rules it out.
  if (stats.value.isDirectory()) {
    await closeQuietly(handle);
    return err({ kind: "unreadable-input", message: `Failed to read ${label}: is a directory.` });
  }

  if (isatty(handle.fd)) {
    await closeQuietly(handle);
    return err({
      kind: "unreadable-input",
      message: `Failed to read ${label}: it is a terminal, nothing will arrive.`,
    });
  }

  if (stats.value.isFile()) {
    await closeQuietly(handle);
    return await tryAsync(async () => await openAsBlob(input), toError);
  }

  // createReadStream defaults to autoClose, closing the handle on the stream's end or error.
  return await drain(handle.createReadStream(), label);
};

// A failed close cannot make the input any less readable, so it is not a result.
const closeQuietly = async (handle: FileHandle): Promise<void> =>
  await handle.close().catch(() => undefined);

const drain = async (source: Readable, label: string): Promise<Result<Blob, RequestBodyError>> =>
  await tryAsync(async () => await blob(source), unreadable(label));

const unreadable =
  (label: string) =>
  (cause: unknown): RequestBodyError => ({
    kind: "unreadable-input",
    message: `Failed to read ${label}: ${errorMessage(cause)}`,
  });
