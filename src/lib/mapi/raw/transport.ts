import type { Header, HttpMethod } from "@kontent-ai/core-sdk";

/**
 * What `kontent mapi` sends through, deliberately narrower than core-sdk's
 * `HttpAdapter`: that one parses `application/json` and drops every other body on
 * the floor, which is an interpretation a passthrough command must not make. The
 * body arrives as the bytes that came off the wire and nothing decides what they
 * mean until the command prints them.
 */
export type RawTransport = (options: RawTransportRequest) => Promise<RawTransportResponse>;

export type RawTransportRequest = Readonly<{
  url: URL;
  method: HttpMethod;
  body: string | Blob | null;
  requestHeaders: ReadonlyArray<Header>;
  abortSignal?: AbortSignal | undefined;
}>;

export type RawTransportResponse = Readonly<{
  status: number;
  statusText: string;
  responseHeaders: ReadonlyArray<Header>;
  body: Uint8Array;
}>;

export const fetchTransport: RawTransport = async (options) => {
  const response = await fetch(options.url, {
    method: options.method,
    headers: new Headers(
      options.requestHeaders.map((header): [string, string] => [header.name, header.value]),
    ),
    body: options.body,
    signal: options.abortSignal ?? null,
  });

  return {
    status: response.status,
    statusText: response.statusText,
    // Names arrive lowercased from fetch, matching how the request headers merge.
    responseHeaders: [...response.headers].map(([name, value]) => ({ name, value })),
    body: await response.bytes(),
  };
};

// An aborted fetch rejects with a DOMException rather than a named subclass, and
// aborting mid-body rejects the same way, so the name is the only thing to match on.
export const isAbortError = (cause: unknown): boolean =>
  cause instanceof Error && cause.name === "AbortError";
