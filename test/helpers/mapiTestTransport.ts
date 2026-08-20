import type { Header, JsonValue } from "@kontent-ai/core-sdk";
import type { RawTransport, RawTransportRequest } from "../../src/lib/mapi/raw/transport.js";

export type MapiReply = Readonly<{
  status?: number;
  statusText?: string;
  headers?: ReadonlyArray<Header>;
  // Convenience for the common case: encoded as JSON, with the matching content type.
  payload?: JsonValue;
  // The raw alternative, for asserting on bodies a JSON payload cannot express.
  body?: string;
  throws?: Error;
}>;

export type MapiRoute = Readonly<{
  method: string;
  path: RegExp;
  // Consumed in order across calls to the same route; the last one repeats.
  replies: ReadonlyArray<MapiReply>;
}>;

export type MapiTestTransport = Readonly<{
  transport: RawTransport;
  requests: ReadonlyArray<RawTransportRequest>;
}>;

// A fake at the RawTransport seam, so the real client code runs against a
// declarative route table and every request is captured for assertions.
export const mapiTestTransport = (routes: ReadonlyArray<MapiRoute>): MapiTestTransport => {
  const requests: RawTransportRequest[] = [];
  const callCounts = new Map<MapiRoute, number>();

  const transport: RawTransport = (options) => {
    requests.push(options);

    const route = routes.find(
      (candidate) =>
        candidate.method === options.method && candidate.path.test(options.url.pathname),
    );
    if (route === undefined) {
      throw new Error(`No mapi stub for ${options.method} ${options.url.pathname}`);
    }

    const callCount = callCounts.get(route) ?? 0;
    callCounts.set(route, callCount + 1);
    const reply = route.replies[Math.min(callCount, route.replies.length - 1)];
    if (reply === undefined) {
      throw new Error(`Route ${route.method} ${route.path} has no replies`);
    }

    if (reply.throws !== undefined) {
      throw reply.throws;
    }

    return Promise.resolve({
      status: reply.status ?? 200,
      statusText: reply.statusText ?? "OK",
      responseHeaders: replyHeaders(reply),
      body: new TextEncoder().encode(replyBody(reply)),
    });
  };

  return { transport, requests };
};

/** Decodes a response body the way the command does, for assertions. */
export const decodeBody = (body: Uint8Array): string => new TextDecoder().decode(body);

export const parseJsonBody = (body: Uint8Array): unknown => JSON.parse(decodeBody(body));

const replyBody = (reply: MapiReply): string => {
  if (reply.body !== undefined) {
    return reply.body;
  }
  return reply.payload === undefined ? "" : JSON.stringify(reply.payload);
};

// A JSON payload implies the content type, so routes do not have to repeat it;
// an explicitly supplied header still wins.
const replyHeaders = (reply: MapiReply): ReadonlyArray<Header> => {
  const supplied = reply.headers ?? [];
  const hasContentType = supplied.some((header) => header.name.toLowerCase() === "content-type");
  if (reply.payload === undefined || hasContentType) {
    return supplied;
  }
  return [{ name: "content-type", value: "application/json" }, ...supplied];
};
