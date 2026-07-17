import { KontentSdkError } from "@kontent-ai/core-sdk";
import { describe, expect, it } from "vitest";
import { formatIapiError } from "../../src/lib/iapi/formatIapiError.js";

const ENV_ID = "11111111-2222-3333-4444-555555555555";
const NOISE_HEADER = "x-served-by";

const httpError = (
  status: number,
  statusText: string,
  reason: "unauthorized" | "invalidResponse" | "notFound",
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
    },
  });

const context = { envId: ENV_ID };

describe("formatIapiError", () => {
  it("maps 401 to a re-login hint without dumping transport detail", () => {
    const message = formatIapiError(httpError(401, "Unauthorized", "unauthorized"), context);
    expect(message).toContain("kontent login");
    expect(message).not.toContain(NOISE_HEADER);
    expect(message).not.toContain("https://");
  });

  it("maps 403 to an access message naming the environment, without transport detail", () => {
    const message = formatIapiError(httpError(403, "Forbidden", "invalidResponse"), context);
    expect(message).toContain(ENV_ID);
    expect(message).toContain("access");
    expect(message).not.toContain(NOISE_HEADER);
  });

  it("falls back to a clean generic summary for other statuses, never headers", () => {
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
    expect(formatIapiError(error, { ...context, verbose: true })).toContain(NOISE_HEADER);
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
