import { describe, expect, it } from "vitest";
import { parseMethod } from "../../src/lib/mapi/raw/method.js";
import { assertErr, assertOk } from "../helpers/assertResult.js";

describe("parseMethod", () => {
  it("defaults to GET without a body", () => {
    const result = parseMethod(undefined, false);

    assertOk(result);
    expect(result.value).toBe("GET");
  });

  it("defaults to POST when a body is supplied", () => {
    const result = parseMethod(undefined, true);

    assertOk(result);
    expect(result.value).toBe("POST");
  });

  it.each(["GET", "POST", "PUT", "DELETE", "PATCH"])("accepts %s", (method) => {
    const result = parseMethod(method, false);

    assertOk(result);
    expect(result.value).toBe(method);
  });

  it("uppercases what the user typed", () => {
    const result = parseMethod("delete", false);

    assertOk(result);
    expect(result.value).toBe("DELETE");
  });

  // An explicit method wins even when it contradicts the body-implied default.
  it("keeps an explicit method over the body-implied one", () => {
    const result = parseMethod("PUT", true);

    assertOk(result);
    expect(result.value).toBe("PUT");
  });

  it.each(["FOO", "", "HEAD", "OPTIONS"])("rejects %j", (method) => {
    const result = parseMethod(method, false);

    assertErr(result);
    expect(result.error).toContain("Use one of GET, POST, PUT, DELETE, PATCH.");
  });
});
