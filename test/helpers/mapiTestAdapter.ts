import type { AdapterRequestOptions, Header, HttpAdapter, JsonValue } from "@kontent-ai/core-sdk";

export type MapiReply = Readonly<{
  status?: number;
  statusText?: string;
  headers?: ReadonlyArray<Header>;
  // Implies the JSON content type unless the route sets one of its own.
  payload?: JsonValue;
  throws?: Error;
}>;

export type MapiRoute = Readonly<{
  method: string;
  path: RegExp;
  // Consumed in order across calls to the same route; the last one repeats.
  replies: ReadonlyArray<MapiReply>;
}>;

export type MapiTestAdapter = Readonly<{
  adapter: HttpAdapter;
  requests: ReadonlyArray<AdapterRequestOptions>;
}>;

// A fake at core-sdk's HttpAdapter seam, so the real client code runs against a
// declarative route table and every request is captured for assertions.
export const mapiTestAdapter = (routes: ReadonlyArray<MapiRoute>): MapiTestAdapter => {
  const requests: AdapterRequestOptions[] = [];
  const callCounts = new Map<MapiRoute, number>();

  const adapter: HttpAdapter = {
    executeRequest: (options) => {
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
        payload: reply.payload ?? null,
        responseHeaders: replyHeaders(reply),
        status: reply.status ?? 200,
        statusText: reply.statusText ?? "OK",
        url: options.url,
      });
    },
  };

  return { adapter, requests };
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
