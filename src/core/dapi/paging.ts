import type { Header, JsonValue } from "@kontent-ai/core-sdk";
import { none, type Option, some } from "../lib/option.js";
import { isErr, type Result } from "../lib/result.js";
import type { PassthroughResponse } from "../passthrough/response.js";
import {
  continuationTokenOf,
  decideNextPage,
  decideResumePoint,
  type ResumePoint,
} from "./nextPage.js";

/** A page of a `--paginate` run, handed out as soon as it arrives. */
export type PagedPage = Readonly<{ payload: JsonValue; pageNumber: number }>;

/** How a `--paginate` run ended, once its pages were handed out. */
export type PagedEnd =
  | Readonly<{
      kind: "complete";
      pageCount: number;
      // Set when --maxPages stopped the run before the last page.
      resume: Option<ResumePoint>;
    }>
  // The first page answering 4xx/5xx is the answer, shown like a single request's.
  | Readonly<{ kind: "first-page-response"; response: PassthroughResponse }>
  | Readonly<{ kind: "first-page-transport"; message: string }>
  | Readonly<{
      kind: "page-failed";
      pageNumber: number;
      reason: string;
      resume: ResumePoint;
    }>;

export type PagingState = Readonly<{
  // The endpoint the run started from; a continuation token resumes it.
  endpoint: string;
  pageCount: number;
  // Where the page about to be read was requested from, to resume there if it fails.
  resume: ResumePoint;
  hasMorePages: boolean;
}>;

/** What to do with one page: print it and read on, or stop, printing its body first if it has one. */
export type PagingStep =
  | Readonly<{ kind: "continue"; page: PagedPage; state: PagingState }>
  | Readonly<{ kind: "end"; page: Option<PagedPage>; end: PagedEnd }>;

// A continuation token the user passed with -H is where the first page starts.
export const startPaging = (
  endpoint: string,
  requestHeaders: ReadonlyArray<Header>,
): PagingState => {
  const token = continuationTokenOf(requestHeaders);
  return {
    endpoint,
    pageCount: 0,
    resume: token === undefined ? { endpoint } : { endpoint, continuationToken: token },
    hasMorePages: false,
  };
};

/** One page in; a transport failure or an HTTP answer, as the paging loop received it. */
export const stepPaging = (
  state: PagingState,
  page: Result<PassthroughResponse, string>,
): PagingStep => {
  const pageNumber = state.pageCount + 1;
  if (isErr(page)) {
    return {
      kind: "end",
      page: none,
      end:
        state.pageCount === 0
          ? { kind: "first-page-transport", message: page.error }
          : { kind: "page-failed", pageNumber, reason: page.error, resume: state.resume },
    };
  }

  const response = page.value;
  if (response.statusCode >= 400) {
    return state.pageCount === 0
      ? { kind: "end", page: none, end: { kind: "first-page-response", response } }
      : {
          kind: "end",
          // A non-JSON error, such as a CDN's HTML 502, has no body to print.
          page: response.body === null ? none : some({ payload: response.body, pageNumber }),
          end: {
            kind: "page-failed",
            pageNumber,
            reason: `HTTP ${response.statusCode}`,
            resume: state.resume,
          },
        };
  }

  const next = decideNextPage({ payload: response.body, headers: response.headers });
  return {
    kind: "continue",
    page: { payload: response.body, pageNumber },
    state: {
      endpoint: state.endpoint,
      pageCount: pageNumber,
      resume: next.kind === "none" ? state.resume : decideResumePoint(next, state.endpoint),
      hasMorePages: next.kind !== "none",
    },
  };
};

/** The end of a run whose pages all arrived; pages left over mean --maxPages stopped it. */
export const endPaging = (state: PagingState): PagedEnd => ({
  kind: "complete",
  pageCount: state.pageCount,
  resume: state.hasMorePages ? some(state.resume) : none,
});
