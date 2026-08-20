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

  it.each([
    ["garbage", "not a number or a date"],
    ["", "an empty value - Number() would read it as 0 and retry immediately"],
    ["   ", "a blank value"],
    ["-5", "a negative delay - Date.parse would read it as the year 2001"],
    ["1.5", "a fractional delay - Date.parse would read it as January 2001"],
    ["1e3", "exponent notation, which delta-seconds does not allow"],
    ["0x10", "hex notation, which delta-seconds does not allow"],
  ])("falls back to the default for %j (%s)", (value) => {
    expect(retryAfterMs([{ name: "Retry-After", value }])).toBe(1000);
  });

  it("reads a zero delay as an immediate retry", () => {
    expect(retryAfterMs([{ name: "Retry-After", value: "0" }])).toBe(0);
  });

  it("passes a delay beyond the retry limit through unclamped, for the caller to reject", () => {
    expect(retryAfterMs([{ name: "Retry-After", value: "3600" }])).toBe(3_600_000);
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
