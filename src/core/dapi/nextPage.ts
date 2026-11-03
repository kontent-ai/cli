import type { Header, JsonValue } from "@kontent-ai/core-sdk";
import { z } from "zod/mini";

/** Where the page after this one comes from, if there is one. */
export type NextPage =
  | Readonly<{ kind: "continuation"; token: string }>
  | Readonly<{ kind: "url"; url: string }>
  | Readonly<{ kind: "none" }>;

/**
 * `items-feed` pages through an `X-Continuation` response header; the other listings put a
 * `pagination.next_page` URL in the body, an empty string on the last page.
 */
export const decideNextPage = (
  page: Readonly<{ payload: JsonValue; headers: ReadonlyArray<Header> }>,
): NextPage => {
  const token = continuationTokenOf(page.headers);
  if (token !== undefined && token !== "") {
    return { kind: "continuation", token };
  }
  const url = nextPageUrlOf(page.payload);
  return url === undefined ? { kind: "none" } : { kind: "url", url };
};

/** The `X-Continuation` header in a request's or a response's headers, whatever its casing. */
export const continuationTokenOf = (headers: ReadonlyArray<Header>): string | undefined =>
  headers.find((header) => header.name.toLowerCase() === "x-continuation")?.value;

/** How to run the command again so it starts at a given page. */
export type ResumePoint = Readonly<{ endpoint: string; continuationToken?: string }>;

/**
 * The resume point for the page `next` describes. A continuation token goes with the
 * endpoint the run started from; a next-page URL becomes an endpoint of its own, relative
 * to the environment like the user's.
 */
export const decideResumePoint = (
  next: Exclude<NextPage, { kind: "none" }>,
  endpoint: string,
): ResumePoint => {
  if (next.kind === "continuation") {
    return { endpoint, continuationToken: next.token };
  }
  const url = new URL(next.url);
  // Delivery's next_page is always /<environment_id>/<path>; its id casing can differ from --envId.
  const [, , ...path] = url.pathname.split("/");
  return { endpoint: `${path.join("/")}${url.search}` };
};

const paginatedPayload = z.object({ pagination: z.object({ next_page: z.url() }) });

const nextPageUrlOf = (payload: JsonValue): string | undefined => {
  const parsed = paginatedPayload.safeParse(payload);
  return parsed.success ? parsed.data.pagination.next_page : undefined;
};
