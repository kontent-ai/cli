import { describe, expect, it } from "vitest";
import { map, ok } from "../../src/core/lib/result.js";
import { resolveMapiEndpoint } from "../../src/core/mapi/endpoint.js";
import { snapshotKinds } from "../../src/core/snapshot/kinds.js";

const ENV_ID = "11111111-2222-3333-4444-555555555555";
const ENV_URL = `https://manage.kontent.ai/v2/projects/${ENV_ID}`;
const params = { baseUrl: "https://manage.kontent.ai/v2", envId: ENV_ID } as const;

const expected = [
  { name: "environment", url: ENV_URL, response: { kind: "entity" } },
  { name: "types", url: `${ENV_URL}/types`, response: { kind: "wrapper", key: "types" } },
  { name: "snippets", url: `${ENV_URL}/snippets`, response: { kind: "wrapper", key: "snippets" } },
  {
    name: "taxonomies",
    url: `${ENV_URL}/taxonomies`,
    response: { kind: "wrapper", key: "taxonomies" },
  },
  {
    name: "languages",
    url: `${ENV_URL}/languages`,
    response: { kind: "wrapper", key: "languages" },
  },
  {
    name: "collections",
    url: `${ENV_URL}/collections`,
    response: { kind: "wrapper", key: "collections" },
  },
  { name: "workflows", url: `${ENV_URL}/workflows`, response: { kind: "array" } },
] as const;

describe("snapshotKinds", () => {
  it("lists the seven kinds in manifest order", () => {
    expect(snapshotKinds.map((kind) => kind.name)).toEqual(expected.map((kind) => kind.name));
  });

  it.each(expected)("$name", ({ name, url, response }) => {
    const kind = snapshotKinds.find((k) => k.name === name);

    expect(kind?.response).toEqual(response);
    expect(map(resolveMapiEndpoint(kind?.endpoint ?? "", params), String)).toEqual(ok(url));
  });
});
