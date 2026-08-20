import type { MapiResponse } from "../../core/mapi/request.js";
import { isJsonContentType } from "../../lib/mapi/raw/contentType.js";

export type PresentedResponse = Readonly<{
  /** Everything destined for stdout, ready to be written in one go. */
  payload: string;
  droppedBodyWarning?: string;
}>;

/**
 * Decides what the response looks like without writing anything, so the two
 * streams are chosen in one place and the rules can be asserted on as values.
 *
 * A body of a type core-sdk skipped never reached this point, so the content type
 * is the only trace left that there was one - report it rather than leave stdout
 * silently empty. Not the content length: a chunked response sends none, and the
 * body would then vanish without a word.
 */
export const presentResponse = (
  response: MapiResponse,
  shouldIncludeHeaders: boolean,
): PresentedResponse => {
  const statusBlock = shouldIncludeHeaders ? formatStatusBlock(response) : "";

  if (isJsonContentType(rawContentType(response))) {
    return { payload: `${statusBlock}${JSON.stringify(response.body, null, 2)}\n` };
  }

  // A response that carried nothing at all - a 204, say - sends no content type
  // either, and there is nothing to report.
  const mediaType = contentType(response);
  if (mediaType === undefined) {
    return { payload: statusBlock };
  }

  const droppedBytes = contentLength(response);
  const carried =
    droppedBytes === undefined ? `a ${mediaType} body` : `${droppedBytes} bytes of ${mediaType}`;
  return {
    payload: statusBlock,
    droppedBodyWarning: `The response carried ${carried}, which is not JSON and was not shown.`,
  };
};

// The version is not the negotiated one: Node's fetch does not expose it.
const formatStatusBlock = (response: MapiResponse): string =>
  [
    `HTTP/1.1 ${response.statusCode} ${response.statusText}`,
    ...response.headers.map((header) => `${header.name}: ${header.value}`),
    "",
    "",
  ].join("\n");

const contentLength = (response: MapiResponse): number | undefined => {
  const raw = response.headers.find(
    (header) => header.name.toLowerCase() === "content-length",
  )?.value;
  if (raw === undefined) {
    return undefined;
  }

  const parsed = Number(raw);
  return Number.isNaN(parsed) ? undefined : parsed;
};

const rawContentType = (response: MapiResponse): string | undefined =>
  response.headers.find((header) => header.name.toLowerCase() === "content-type")?.value;

// The media type alone, for a message a human reads; the decision to print uses
// the raw value, because that is what the adapter parsed by.
const contentType = (response: MapiResponse): string | undefined =>
  rawContentType(response)?.split(";")[0]?.trim().toLowerCase();
