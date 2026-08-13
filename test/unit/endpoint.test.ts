import { describe, expect, it } from "vitest";
import { resolveEndpoint } from "../../src/lib/mapi/raw/endpoint.js";

const ENV_ID = "11111111-2222-3333-4444-555555555555";
const params = { baseUrl: "https://manage.kontent.ai/v2", envId: ENV_ID } as const;

const resolve = (endpoint: string) => resolveEndpoint(endpoint, params);

describe("resolveEndpoint", () => {
  it("scopes a bare path to the environment", () => {
    const result = resolve("types");

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") {
      return;
    }
    expect(result.value.toString()).toBe(`https://manage.kontent.ai/v2/projects/${ENV_ID}/types`);
  });

  it("keeps a projects/ path verbatim and fills the environment placeholder", () => {
    const result = resolve("projects/{environment_id}/types");

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") {
      return;
    }
    expect(result.value.toString()).toBe(`https://manage.kontent.ai/v2/projects/${ENV_ID}/types`);
  });

  it("keeps the query string", () => {
    const result = resolve("types?limit=10");

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") {
      return;
    }
    expect(result.value.search).toBe("?limit=10");
  });

  it("tolerates a leading slash", () => {
    const result = resolve("/types");

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") {
      return;
    }
    expect(result.value.pathname).toBe(`/v2/projects/${ENV_ID}/types`);
  });

  it("percent-encodes the environment id", () => {
    const result = resolveEndpoint("types", { ...params, envId: "a b/c" });

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") {
      return;
    }
    expect(result.value.pathname).toBe("/v2/projects/a%20b%2Fc/types");
  });

  it.each([
    ["", "empty"],
    ["   ", "empty"],
    ["https://evil.example.com/types", "absolute-url"],
    ["//evil.example.com/types", "absolute-url"],
    ["file:///etc/passwd", "absolute-url"],
    ["../../admin", "traversal"],
    ["types/../../admin", "traversal"],
    ["types/%2e%2e/admin", "traversal"],
  ])("rejects %j as %s", (endpoint, kind) => {
    const result = resolve(endpoint);

    expect(result.kind).toBe("err");
    if (result.kind !== "err") {
      return;
    }
    expect(result.error.kind).toBe(kind);
  });
});
