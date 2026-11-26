import { describe, expect, it } from "vitest";
import { resolveDapiEndpoint } from "../../src/core/dapi/endpoint.js";
import { resolveMapiEndpoint } from "../../src/core/mapi/endpoint.js";
import { validateEndpoint } from "../../src/core/passthrough/endpoint.js";
import { assertErr, assertOk } from "../helpers/assertResult.js";

const ENV_ID = "11111111-2222-3333-4444-555555555555";
const params = { baseUrl: "https://manage.kontent.ai/v2", envId: ENV_ID } as const;

const resolve = (endpoint: string) => resolveMapiEndpoint(endpoint, params);

describe("resolveMapiEndpoint", () => {
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
    expect(result.value.toString()).toBe(
      `https://manage.kontent.ai/v2/projects/${ENV_ID}/types?limit=10`,
    );
    expect(result.value.pathname).toBe(`/v2/projects/${ENV_ID}/types`);
    expect(result.value.search).toBe("?limit=10");
  });

  it("tolerates a leading slash", () => {
    const result = resolve("/types");

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") {
      return;
    }
    expect(result.value.toString()).toBe(`https://manage.kontent.ai/v2/projects/${ENV_ID}/types`);
    expect(result.value.pathname).toBe(`/v2/projects/${ENV_ID}/types`);
  });

  it("percent-encodes the environment id", () => {
    const result = resolveMapiEndpoint("types", { ...params, envId: "a b/c" });

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") {
      return;
    }
    expect(result.value.toString()).toBe("https://manage.kontent.ai/v2/projects/a%20b%2Fc/types");
    expect(result.value.pathname).toBe("/v2/projects/a%20b%2Fc/types");
  });

  it("names the Management API when rejecting an absolute URL", () => {
    const result = resolve("https://evil.example.com/types");

    expect(result.kind).toBe("err");
    if (result.kind !== "err") {
      return;
    }
    expect(result.error.message).toContain("The host is always the Management API.");
  });
});

describe("validateEndpoint", () => {
  it.each([
    ["", "empty"],
    ["   ", "empty"],
    ["https://evil.example.com/types", "absolute-url"],
    ["//evil.example.com/types", "absolute-url"],
    ["file:///etc/passwd", "absolute-url"],
  ])("rejects %j as %s", (endpoint, kind) => {
    const result = validateEndpoint(endpoint, { envId: ENV_ID, apiName: "Management API" });

    assertErr(result);
    expect(result.error.kind).toBe(kind);
  });
});

// The scope is checked on the built URL, after the parser has dropped tabs and line breaks
// and resolved dot segments, percent-encoded dots and backslashes.
describe("endpoint scope", () => {
  const resolveFor = (api: "mapi" | "dapi", endpoint: string, envId: string) =>
    api === "mapi"
      ? resolveMapiEndpoint(endpoint, { baseUrl: "https://manage.kontent.ai/v2", envId })
      : resolveDapiEndpoint(endpoint, { baseUrl: "https://deliver.kontent.ai", envId });

  it.each([
    { api: "mapi", endpoint: "items/../types", pathname: `/v2/projects/${ENV_ID}/types` },
    {
      api: "mapi",
      endpoint: "%252e%252e/other-env",
      pathname: `/v2/projects/${ENV_ID}/%252e%252e/other-env`,
    },
    { api: "mapi", endpoint: "types?x=../..", pathname: `/v2/projects/${ENV_ID}/types` },
    { api: "mapi", endpoint: "projects/other-env/types", pathname: "/v2/projects/other-env/types" },
    {
      api: "mapi",
      endpoint: "ht\ntps://evil.example/x",
      pathname: `/v2/projects/${ENV_ID}/https://evil.example/x`,
    },
    { api: "dapi", endpoint: "items/../types", pathname: `/${ENV_ID}/types` },
  ] as const)("keeps $api $endpoint at $pathname", ({ api, endpoint, pathname }) => {
    const result = resolveFor(api, endpoint, ENV_ID);

    assertOk(result);
    expect(result.value.origin).toBe(
      api === "mapi" ? "https://manage.kontent.ai" : "https://deliver.kontent.ai",
    );
    expect(result.value.pathname).toBe(pathname);
  });

  it.each([
    { api: "mapi", endpoint: "../other-env/types", leaves: "environment" },
    { api: "mapi", endpoint: ".\n./other-env/types", leaves: "environment" },
    { api: "mapi", endpoint: ".\t./other-env/types", leaves: "environment" },
    { api: "mapi", endpoint: "types\\..\\..\\other-env", leaves: "environment" },
    { api: "mapi", endpoint: "%2e%2e/other-env/types", leaves: "environment" },
    { api: "mapi", endpoint: ".%2e/other-env/types", leaves: "environment" },
    { api: "mapi", endpoint: "projects/../other-api", leaves: "projects path" },
    { api: "dapi", endpoint: "items/.\n./.\n./other-env/items", leaves: "environment" },
  ] as const)("refuses $api $endpoint as leaving the $leaves", ({ api, endpoint, leaves }) => {
    const result = resolveFor(api, endpoint, ENV_ID);

    assertErr(result);
    expect(result.error).toEqual({
      kind: "traversal",
      message: `The endpoint ${JSON.stringify(endpoint)} leaves the ${leaves}.`,
    });
  });

  it.each([
    { api: "mapi", envId: ".." },
    { api: "mapi", envId: "." },
    { api: "dapi", envId: ".." },
    { api: "dapi", envId: "." },
  ] as const)("refuses $api with the environment id $envId, naming the id", ({ api, envId }) => {
    const result = resolveFor(api, "types", envId);

    assertErr(result);
    expect(result.error).toEqual({
      kind: "traversal",
      message: `The environment id "${envId}" must not be "." or "..".`,
    });
  });
});
