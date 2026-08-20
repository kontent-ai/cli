import { describe, expect, it, vi } from "vitest";
import { resolveCredential } from "../../src/commands/mapi/request.js";
import { ok } from "../../src/lib/result.js";
import { assertOk } from "../helpers/assertResult.js";

vi.mock("../../src/lib/auth/tokenAccess.js", () => ({
  getValidAccessToken: vi.fn(async () => ok("stored-login-token")),
}));

const authorization = [{ name: "Authorization", value: "Bearer supplied" }];

describe("resolveCredential", () => {
  it("prefers an Authorization header and adds no token of its own", async () => {
    const result = await resolveCredential(authorization, "flag-key", {
      KONTENT_MAPI_KEY: "env-key",
    });

    assertOk(result);
    expect(result.value).toEqual({ source: "header" });
  });

  it("matches the Authorization header case-insensitively", async () => {
    const result = await resolveCredential(
      [{ name: "authorization", value: "Bearer x" }],
      undefined,
      {},
    );

    assertOk(result);
    expect(result.value.source).toBe("header");
  });

  it("prefers --mapiKey over the environment variable", async () => {
    const result = await resolveCredential([], "flag-key", { KONTENT_MAPI_KEY: "env-key" });

    assertOk(result);
    expect(result.value).toEqual({ token: "flag-key", source: "mapi-key" });
  });

  it("falls back to KONTENT_MAPI_KEY when --mapiKey is absent", async () => {
    const result = await resolveCredential([], undefined, { KONTENT_MAPI_KEY: "env-key" });

    assertOk(result);
    expect(result.value).toEqual({ token: "env-key", source: "mapi-key" });
  });

  it("falls back to the stored login token when nothing is supplied", async () => {
    const result = await resolveCredential([], undefined, {});

    assertOk(result);
    expect(result.value).toEqual({ token: "stored-login-token", source: "login" });
  });

  // An exported-but-empty variable is how a CI runner spells "unset".
  it("treats an empty KONTENT_MAPI_KEY as unset", async () => {
    const result = await resolveCredential([], undefined, { KONTENT_MAPI_KEY: "" });

    assertOk(result);
    expect(result.value).toEqual({ token: "stored-login-token", source: "login" });
  });
});
