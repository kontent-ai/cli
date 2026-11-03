import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { printPages } from "../../src/cli/commands/dapi/request/runRequest.js";
import type { PagedEnd, PagedPage } from "../../src/core/dapi/paging.js";
import { none } from "../../src/core/lib/option.js";

const PAGE_FAILED: PagedEnd = {
  kind: "page-failed",
  pageNumber: 3,
  reason: "HTTP 500",
  resume: { endpoint: "items-feed", continuationToken: "token-3" },
};

// Records which pages were pulled, so a test sees what would have been fetched.
const pagesOf = (
  count: number,
  end: PagedEnd,
  fetched: Array<number>,
): AsyncGenerator<PagedPage, PagedEnd> =>
  (async function* () {
    for (const pageNumber of Array.from({ length: count }, (_, index) => index + 1)) {
      await Promise.resolve();
      fetched.push(pageNumber);
      yield { payload: { items: [pageNumber] }, pageNumber };
    }
    return end;
  })();

// The first `refusedWrites` writes report a full buffer, as a pipe to a slow reader does.
const fakeStdout = (writableWrites: number, refusedWrites = 0) => {
  const chunks: Array<string> = [];
  const stdout = Object.assign(new EventEmitter(), {
    writable: writableWrites > 0,
    write: (chunk: Uint8Array | string) => {
      chunks.push(String(chunk));
      stdout.writable = chunks.length < writableWrites;
      return chunks.length > refusedWrites;
    },
  });
  return { chunks, stdout };
};

describe("printPages", () => {
  it("closes the --slurp array when a later page fails", async () => {
    const { chunks, stdout } = fakeStdout(Number.POSITIVE_INFINITY);

    const end = await printPages(pagesOf(2, PAGE_FAILED, []), stdout, true, 0);

    expect(end).toEqual(PAGE_FAILED);
    expect(JSON.parse(chunks.join(""))).toEqual([{ items: [1] }, { items: [2] }]);
  });

  it("stops fetching once the reader is gone", async () => {
    const fetched: Array<number> = [];
    const { stdout } = fakeStdout(1);

    const end = await printPages(pagesOf(5, PAGE_FAILED, fetched), stdout, false, 0);

    expect(fetched).toEqual([1]);
    expect(end).toEqual({ kind: "complete", pageCount: 1, resume: none });
  });

  it("fetches the next page only once a slow reader drains", async () => {
    const fetched: Array<number> = [];
    const complete: PagedEnd = { kind: "complete", pageCount: 2, resume: none };
    const { stdout } = fakeStdout(Number.POSITIVE_INFINITY, 1);

    const printing = printPages(pagesOf(2, complete, fetched), stdout, false, 0);
    await new Promise((resolve) => setImmediate(resolve));

    expect(fetched).toEqual([1]);
    stdout.emit("drain");
    expect(await printing).toEqual(complete);
    expect(fetched).toEqual([1, 2]);
  });
});
