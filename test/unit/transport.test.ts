import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchTransport, isAbortError } from "../../src/lib/mapi/raw/transport.js";

const URL_UNDER_TEST = new URL("https://manage.test/v2/projects/x/types");

type FetchInit = Readonly<{
  method?: string;
  headers?: Headers;
  body?: unknown;
  signal?: AbortSignal | null;
}>;

// The transport is the one place that touches global fetch, so the seam under test
// is fetch itself. A real Response goes back, to exercise the header and body reads.
const stubFetch = (response: Response) => {
  const spy = vi.fn(async (_url: URL, _init: FetchInit) => response);
  vi.stubGlobal("fetch", spy);
  return spy;
};

const lastInit = (spy: ReturnType<typeof stubFetch>): FetchInit => spy.mock.calls.at(-1)?.[1] ?? {};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchTransport", () => {
  it("forwards the method, headers, body and abort signal to fetch", async () => {
    const spy = stubFetch(new Response(null, { status: 200 }));
    const controller = new AbortController();
    const body = new Blob(['{"codename":"x"}']);

    await fetchTransport({
      url: URL_UNDER_TEST,
      method: "POST",
      body,
      requestHeaders: [
        { name: "authorization", value: "Bearer token" },
        { name: "x-foo", value: "1" },
      ],
      abortSignal: controller.signal,
    });

    expect(spy.mock.calls.at(-1)?.[0]).toBe(URL_UNDER_TEST);
    const init = lastInit(spy);
    expect(init.method).toBe("POST");
    expect(init.body).toBe(body);
    expect(init.signal).toBe(controller.signal);
    expect([...(init.headers ?? new Headers())]).toEqual([
      ["authorization", "Bearer token"],
      ["x-foo", "1"],
    ]);
  });

  it("passes a null signal when the caller supplies none", async () => {
    const spy = stubFetch(new Response(null, { status: 200 }));

    await fetchTransport({
      url: URL_UNDER_TEST,
      method: "GET",
      body: null,
      requestHeaders: [],
    });

    expect(lastInit(spy).signal).toBeNull();
  });

  it("reports the status line and the response headers as a lowercased array", async () => {
    stubFetch(
      new Response(null, {
        status: 404,
        statusText: "Not Found",
        headers: { "Content-Type": "application/json", "X-Request-Id": "abc" },
      }),
    );

    const response = await fetchTransport({
      url: URL_UNDER_TEST,
      method: "GET",
      body: null,
      requestHeaders: [],
    });

    expect(response.status).toBe(404);
    expect(response.statusText).toBe("Not Found");
    expect(response.responseHeaders).toEqual([
      { name: "content-type", value: "application/json" },
      { name: "x-request-id", value: "abc" },
    ]);
  });

  // The whole point of the transport: no parsing, no decoding, no interpretation.
  it("returns the body as the bytes that came off the wire", async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0xff, 0xfe, 0x00]);
    stubFetch(new Response(png, { status: 200 }));

    const response = await fetchTransport({
      url: URL_UNDER_TEST,
      method: "GET",
      body: null,
      requestHeaders: [],
    });

    expect(Buffer.compare(response.body, Buffer.from(png))).toBe(0);
  });

  it("returns an empty body for a response that has none", async () => {
    stubFetch(new Response(null, { status: 204, statusText: "No Content" }));

    const response = await fetchTransport({
      url: URL_UNDER_TEST,
      method: "DELETE",
      body: null,
      requestHeaders: [],
    });

    expect(response.body).toHaveLength(0);
  });
});

describe("isAbortError", () => {
  // What an aborted fetch actually rejects with - a DOMException, not a named subclass.
  it("recognizes the DOMException an aborted fetch rejects with", () => {
    expect(isAbortError(new DOMException("This operation was aborted.", "AbortError"))).toBe(true);
  });

  it("recognizes an AbortError that is a plain Error", () => {
    const error = new Error("aborted");
    error.name = "AbortError";

    expect(isAbortError(error)).toBe(true);
  });

  it("does not claim an unrelated failure was an abort", () => {
    expect(isAbortError(new TypeError("fetch failed"))).toBe(false);
    expect(isAbortError("AbortError")).toBe(false);
    expect(isAbortError(undefined)).toBe(false);
  });
});
