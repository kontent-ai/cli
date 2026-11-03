import type { Header } from "@kontent-ai/core-sdk";
import { map, type Result } from "../lib/result.js";
import { type HeaderError, parseHeaders } from "../passthrough/headers.js";

/** The headers a Delivery request goes out with, before the credential is added. */
export const buildDapiHeaders = (
  args: Readonly<{ header: ReadonlyArray<string> | undefined; isWaitingForNewContent: boolean }>,
): Result<ReadonlyArray<Header>, HeaderError> =>
  map(parseHeaders(args.header ?? []), (parsed) =>
    args.isWaitingForNewContent ? [WAIT_FOR_NEW_CONTENT_HEADER, ...parsed] : parsed,
  );

const WAIT_FOR_NEW_CONTENT_HEADER: Header = {
  name: "X-KC-Wait-For-Loading-New-Content",
  value: "true",
};
