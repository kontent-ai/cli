import { KontentSdkError } from "@kontent-ai/core-sdk";
import { describe, expect, it } from "vitest";
import * as z from "zod/mini";
import { formatLearnError } from "../../src/lib/learn/formatLearnError.js";

const URL_TEXT = "https://learn-mcp.kontent.ai/search?text=roles";

const baseErrorData = {
  message: "Failed to execute 'GET' request",
  url: URL_TEXT,
  retryStrategyOptions: undefined,
  retryAttempt: undefined,
};

describe("formatLearnError", () => {
  it("reports an HTTP failure with its status and url", () => {
    const message = formatLearnError(
      new KontentSdkError({
        baseErrorData,
        details: {
          reason: "invalidResponse",
          status: 400,
          statusText: "Bad Request",
          responseHeaders: [],
          kontentErrorResponse: undefined,
          adapterResponse: undefined,
        },
      }),
    );

    expect(message).toContain("[invalidResponse]");
    expect(message).toContain("status: 400 Bad Request");
    expect(message).toContain(`url: ${URL_TEXT}`);
  });

  it("digs the actual cause out of an unreachable service", () => {
    const message = formatLearnError(
      new KontentSdkError({
        baseErrorData,
        details: {
          reason: "adapterError",
          originalError: new Error("fetch failed", {
            cause: new Error("getaddrinfo ENOTFOUND learn-mcp.kontent.ai"),
          }),
        },
      }),
    );

    expect(message).toContain("fetch failed: getaddrinfo ENOTFOUND learn-mcp.kontent.ai");
    expect(message).not.toContain("status:");
  });

  it("says the shape was unexpected when the schema rejects the payload", () => {
    const parsed = z.safeParse(z.object({ title: z.string() }), {});
    const message = formatLearnError(
      new KontentSdkError({
        baseErrorData,
        details: {
          reason: "parsingFailed",
          // biome-ignore lint/style/noNonNullAssertion: the parse of an empty object always fails
          zodError: parsed.error!,
          payload: {},
          url: new URL(URL_TEXT),
        },
      }),
    );

    expect(message).toContain("unexpected shape");
    expect(message).toContain(`url: ${URL_TEXT}`);
    expect(message).not.toContain("status:");
  });
});
