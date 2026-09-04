import { describe, expect, it } from "vitest";
import { parseHeaders } from "../../src/lib/mapi/raw/headers.js";

describe("parseHeaders", () => {
  it("returns an empty list for no entries", () => {
    const result = parseHeaders([]);

    expect(result).toEqual({ kind: "ok", value: [] });
  });

  it("parses entries and trims around the separator", () => {
    const result = parseHeaders(["Content-Type: application/json", "X-Foo:bar", "X-Empty:"]);

    expect(result).toEqual({
      kind: "ok",
      value: [
        { name: "Content-Type", value: "application/json" },
        { name: "X-Foo", value: "bar" },
        { name: "X-Empty", value: "" },
      ],
    });
  });

  it("keeps colons inside the value", () => {
    const result = parseHeaders(["X-Url: https://example.com/a:b"]);

    expect(result).toEqual({
      kind: "ok",
      value: [{ name: "X-Url", value: "https://example.com/a:b" }],
    });
  });

  it.each(["no-separator", ": missing-name", ""])("rejects %j as a format error", (entry) => {
    const result = parseHeaders([entry]);

    expect(result.kind).toBe("err");
    if (result.kind !== "err") {
      return;
    }
    expect(result.error).toContain('Expected the "Name: value" format');
  });

  it.each([
    "bad name: value",
    "bad(name): value",
    "naïve: value",
  ])("rejects %j as a name error", (entry) => {
    const result = parseHeaders([entry]);

    expect(result.kind).toBe("err");
    if (result.kind !== "err") {
      return;
    }
    expect(result.error).toContain("Names may contain only letters, digits and");
  });

  it("fails on the first malformed entry", () => {
    const result = parseHeaders(["X-Good: 1", "oops"]);

    expect(result.kind).toBe("err");
    if (result.kind !== "err") {
      return;
    }
    expect(result.error).toContain("oops");
  });
});
