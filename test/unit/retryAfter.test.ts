import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { retryAfterMs } from "../../src/lib/mapi/raw/client.js";

describe("retryAfterMs", () => {
  it("defaults to one second without a Retry-After header", () => {
    expect(retryAfterMs([])).toBe(1000);
  });

  it("converts a delay in seconds to milliseconds", () => {
    expect(retryAfterMs([{ name: "Retry-After", value: "2" }])).toBe(2000);
  });

  it("matches the header name case-insensitively", () => {
    expect(retryAfterMs([{ name: "retry-after", value: "3" }])).toBe(3000);
  });

  it("clamps a negative delay to zero", () => {
    expect(retryAfterMs([{ name: "Retry-After", value: "-5" }])).toBe(0);
  });

  it("falls back to the default for an unparsable value", () => {
    expect(retryAfterMs([{ name: "Retry-After", value: "garbage" }])).toBe(1000);
  });

  describe("with an HTTP-date value", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("waits until the given moment", () => {
      expect(retryAfterMs([{ name: "Retry-After", value: "Thu, 01 Jan 2026 00:00:05 GMT" }])).toBe(
        5000,
      );
    });

    it("clamps a moment already in the past to zero", () => {
      expect(retryAfterMs([{ name: "Retry-After", value: "Wed, 31 Dec 2025 23:59:00 GMT" }])).toBe(
        0,
      );
    });
  });
});
