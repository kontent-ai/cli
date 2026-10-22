import { describe, expect, it } from "vitest";
import { planRequest } from "../../src/core/mapi/raw/planRequest.js";
import { assertErr, assertOk } from "../helpers/assertResult.js";

describe("planRequest", () => {
  it("rejects a body on an explicit GET instead of letting the transport throw", () => {
    const result = planRequest({ method: "GET", header: [], hasBody: true });

    assertErr(result);
    expect(result.error.message).toContain("A GET request cannot carry a body");
  });

  it("defaults a body to JSON, an explicit Content-Type coming after so it wins", () => {
    const result = planRequest({
      method: undefined,
      header: ["Content-Type: image/png"],
      hasBody: true,
    });

    assertOk(result);
    expect(result.value.method).toBe("POST");
    expect(result.value.headers).toEqual([
      { name: "Content-Type", value: "application/json" },
      { name: "Content-Type", value: "image/png" },
    ]);
  });

  it("adds no Content-Type without a body", () => {
    const result = planRequest({ method: undefined, header: ["X-Foo: 1"], hasBody: false });

    assertOk(result);
    expect(result.value).toEqual({ method: "GET", headers: [{ name: "X-Foo", value: "1" }] });
  });
});
