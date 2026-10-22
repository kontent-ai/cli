import { describe, expect, it } from "vitest";
import type { AuthError } from "../../src/core/auth/types.js";
import { decideVerification } from "../../src/core/environment/decideVerification.js";
import { err, ok } from "../../src/core/lib/result.js";

const STORAGE_FAILURE: AuthError = { kind: "storage-read-failed", cause: new Error("locked") };

describe("decideVerification", () => {
  it.each([
    ["a live token", ok("token"), { kind: "verify", accessToken: "token" }],
    ["no login", err({ kind: "not-logged-in" } as const), { kind: "skip-verification" }],
    ["any other auth failure", err(STORAGE_FAILURE), { kind: "fail", error: STORAGE_FAILURE }],
  ] as const)("decides on %s", (_, accessToken, expected) => {
    expect(decideVerification(accessToken)).toEqual(expected);
  });
});
