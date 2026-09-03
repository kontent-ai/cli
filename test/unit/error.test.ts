import { describe, expect, it } from "vitest";
import { errorMessage } from "../../src/lib/error.js";

describe("errorMessage", () => {
  it("returns the message of a lone error", () => {
    expect(errorMessage(new Error("fetch failed"))).toBe("fetch failed");
  });

  it("stringifies a non-error", () => {
    expect(errorMessage("boom")).toBe("boom");
    expect(errorMessage(undefined)).toBe("undefined");
  });

  it("omits the separator for an error that wraps nothing", () => {
    expect(errorMessage(new Error("fetch failed", { cause: undefined }))).toBe("fetch failed");
  });

  // undici hides the actionable reason one level down: "fetch failed" alone
  // tells the user nothing about DNS, a refused connection or a TLS failure.
  it("appends the causes a transport error wraps", () => {
    const cause = new Error("fetch failed", {
      cause: new Error("getaddrinfo ENOTFOUND manage.kontent.ai"),
    });

    expect(errorMessage(cause)).toBe("fetch failed: getaddrinfo ENOTFOUND manage.kontent.ai");
  });

  // A refused connection arrives as an AggregateError with an empty message, so
  // following `cause` alone leaves the user with a bare "fetch failed: ".
  it("appends the reasons an AggregateError cause collects", () => {
    const cause = new Error("fetch failed", {
      cause: new AggregateError([
        new Error("connect ECONNREFUSED ::1:45999"),
        new Error("connect ECONNREFUSED 127.0.0.1:45999"),
      ]),
    });

    expect(errorMessage(cause)).toBe(
      "fetch failed: connect ECONNREFUSED ::1:45999, connect ECONNREFUSED 127.0.0.1:45999",
    );
  });

  it("stops on a cause chain that loops back on itself", () => {
    const inner = new Error("inner");
    const outer = new Error("outer", { cause: inner });
    inner.cause = outer;

    expect(errorMessage(outer)).toBe("outer: inner: outer");
  });
});
