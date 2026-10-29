import type { Header, JsonValue } from "@kontent-ai/core-sdk";

export type MapiResponse = Readonly<{
  statusCode: number;
  // Empty when the server sent no reason phrase, which HTTP/2 never does.
  statusText: string;
  headers: ReadonlyArray<Header>;
  // Null for a body that was absent, for one core-sdk skipped as non-JSON, and for
  // a literal JSON null alike, so it cannot say whether the response carried
  // anything. The command reads the headers instead: the content type decides
  // whether to print, the content length whether something was dropped.
  body: JsonValue;
}>;
