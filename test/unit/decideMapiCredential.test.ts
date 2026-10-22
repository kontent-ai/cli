import { describe, expect, it } from "vitest";
import { decideMapiCredential } from "../../src/core/mapi/decideMapiCredential.js";

const authorization = [{ name: "Authorization", value: "Bearer supplied" }];

describe("decideMapiCredential", () => {
  it("prefers an Authorization header and adds no token of its own", () => {
    expect(
      decideMapiCredential({ headers: authorization, mapiKey: "flag-key", envMapiKey: "env-key" }),
    ).toEqual({ source: "header" });
  });

  it("matches the Authorization header case-insensitively", () => {
    const headers = [{ name: "authorization", value: "Bearer x" }];

    expect(decideMapiCredential({ headers, mapiKey: undefined, envMapiKey: undefined })).toEqual({
      source: "header",
    });
  });

  it("prefers --mapiKey over the environment variable", () => {
    expect(
      decideMapiCredential({ headers: [], mapiKey: "flag-key", envMapiKey: "env-key" }),
    ).toEqual({ source: "mapi-key", token: "flag-key" });
  });

  it("falls back to KONTENT_MAPI_KEY when --mapiKey is absent", () => {
    expect(
      decideMapiCredential({ headers: [], mapiKey: undefined, envMapiKey: "env-key" }),
    ).toEqual({ source: "mapi-key", token: "env-key" });
  });

  it("falls back to the login when nothing is supplied", () => {
    expect(
      decideMapiCredential({ headers: [], mapiKey: undefined, envMapiKey: undefined }),
    ).toEqual({ source: "login" });
  });

  // An exported-but-empty variable is how a CI runner spells "unset".
  it("treats an empty KONTENT_MAPI_KEY as unset", () => {
    expect(decideMapiCredential({ headers: [], mapiKey: undefined, envMapiKey: "" })).toEqual({
      source: "login",
    });
  });
});
