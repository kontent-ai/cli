import { KontentSdkError } from "@kontent-ai/core-sdk";
import { describe, expect, it } from "vitest";
import { formatIapiError } from "../../src/cli/adapters/iapi/formatIapiError.js";

const NOISE_HEADER = "x-served-by";

const httpError = (
  status: number,
  statusText: string,
  reason: "invalidResponse" | "notFound",
  kontentErrorResponse?: { message: string; request_id: string; error_code: number },
): KontentSdkError =>
  new KontentSdkError({
    baseErrorData: {
      message: "Failed to execute 'GET' request",
      url: "https://app.example.com/api/project-management/env",
      retryStrategyOptions: undefined,
      retryAttempt: undefined,
    },
    details: {
      reason,
      status,
      statusText,
      responseHeaders: [{ name: NOISE_HEADER, value: "cache-vie6340-VIE" }],
      kontentErrorResponse,
      adapterResponse: undefined,
    },
  });

const context = { isVerbose: false };

describe("formatIapiError", () => {
  it("summarizes an HTTP failure without headers", () => {
    const error = httpError(404, "Not Found", "notFound", {
      message: "Project not found.",
      request_id: "req-123",
      error_code: 101,
    });
    const message = formatIapiError(error, context);

    expect(message).toContain("404 Not Found");
    expect(message).toContain("Project not found.");
    expect(message).toContain("req-123");
    expect(message).toContain("url:");
    expect(message).not.toContain(NOISE_HEADER);
  });

  it("includes the raw details dump only under verbose", () => {
    const error = httpError(500, "Internal Server Error", "invalidResponse");

    expect(formatIapiError(error, context)).not.toContain(NOISE_HEADER);
    expect(formatIapiError(error, { ...context, isVerbose: true })).toContain(NOISE_HEADER);
  });

  it("summarizes non-HTTP failures without a status line", () => {
    const adapterError = new KontentSdkError({
      baseErrorData: {
        message: "Network unreachable",
        url: "https://app.example.com/api/x",
        retryStrategyOptions: undefined,
        retryAttempt: undefined,
      },
      details: { reason: "adapterError", originalError: new Error("ECONNREFUSED") },
    });
    const message = formatIapiError(adapterError, context);

    expect(message).toContain("[adapterError]");
    expect(message).not.toContain("status:");
  });
});
