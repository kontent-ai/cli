import { getDefaultHttpAdapter } from "@kontent-ai/core-sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import { isJsonContentType } from "../../src/lib/mapi/raw/contentType.js";

// isJsonContentType duplicates core-sdk's unexported parse rule, so the two can
// drift apart on a version bump. Driving the real adapter over a stubbed fetch
// is the only way to notice: a content type the command prints as JSON must be
// exactly one the adapter actually parsed.
const contentTypes = [
  "application/json",
  "application/json; charset=utf-8",
  "Application/JSON",
  // A proxy that joins two Content-Type headers into one comma-separated value.
  "application/json, application/json",
  "application/problem+json",
  "text/html; charset=utf-8",
  "application/octet-stream",
  "text/plain",
];

describe("isJsonContentType", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each(contentTypes)("agrees with core-sdk's adapter on %j", async (contentType) => {
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(JSON.stringify({ name: "Article" }), {
          headers: { "content-type": contentType },
        }),
    );

    const executeRequest = getDefaultHttpAdapter().executeRequest;
    if (executeRequest === undefined) {
      throw new Error("The default adapter cannot execute requests.");
    }
    const response = await executeRequest({
      url: new URL("https://manage.kontent.ai/v2/projects/x/types"),
      method: "GET",
      body: null,
    });

    expect(response.payload !== null).toBe(isJsonContentType(contentType));
  });
});
