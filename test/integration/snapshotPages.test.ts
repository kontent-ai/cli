import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { files } from "../../src/cli/adapters/files/files.js";
import { createRawClient } from "../../src/cli/adapters/http/rawClient.js";
import { snapshot } from "../../src/cli/commands/model/snapshot/runSnapshot.js";
import { createLogger } from "../../src/cli/log.js";
import { err } from "../../src/core/lib/result.js";
import { assertOk } from "../helpers/assertResult.js";
import { type HttpRoute, httpTestAdapter } from "../helpers/httpTestAdapter.js";

const ENV_ID = "11111111-2222-3333-4444-555555555555";
const LANGUAGE_ID = "6e3c0c8a-2d4b-4f53-9c1e-0a7b5d9e2f11";
const LAST_PAGE = { continuation_token: null, next_page: null };

const routes: ReadonlyArray<HttpRoute> = [
  {
    method: "GET",
    path: new RegExp(`/projects/${ENV_ID}$`),
    replies: [{ payload: { id: ENV_ID, name: "Site", environment: "Production" } }],
  },
  {
    method: "GET",
    path: /\/types$/,
    replies: [
      {
        payload: {
          types: [{ id: "a1", codename: "article" }],
          pagination: { continuation_token: "token-2", next_page: "https://manage.test/next" },
        },
      },
      { payload: { types: [{ id: "p1", codename: "page" }], pagination: LAST_PAGE } },
    ],
  },
  {
    method: "GET",
    path: /\/snippets$/,
    replies: [{ payload: { snippets: [], pagination: LAST_PAGE } }],
  },
  {
    method: "GET",
    path: /\/taxonomies$/,
    replies: [{ payload: { taxonomies: [], pagination: LAST_PAGE } }],
  },
  {
    method: "GET",
    path: /\/languages$/,
    replies: [
      { payload: { languages: [{ id: LANGUAGE_ID, codename: "default" }], pagination: LAST_PAGE } },
    ],
  },
  {
    method: "GET",
    path: /\/collections$/,
    replies: [{ payload: { collections: [{ id: "c1", codename: "default" }] } }],
  },
  {
    method: "GET",
    path: /\/workflows$/,
    replies: [{ payload: [{ id: "w1", codename: "default" }] }],
  },
];

describe("snapshot over HTTP", () => {
  let tempDir: string;

  beforeAll(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "kontent-snapshot-"));
  });

  afterAll(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("writes every page of a paged kind and sends the continuation token back", async () => {
    const { adapter, requests } = httpTestAdapter(routes);
    const logger = createLogger("none");
    const path = join(tempDir, "model-snapshot");

    const result = await snapshot(
      {
        logger,
        config: { read: () => Promise.resolve({}) },
        session: { tokens: () => Promise.resolve(err({ kind: "not-logged-in" })) },
        mapi: createRawClient({ adapter, logger }),
        files,
      },
      { path, baseUrl: "https://manage.test/v2", envId: ENV_ID, mapiKey: "secret-key" },
    );

    assertOk(result);
    expect((await readdir(join(path, "types"))).sort()).toEqual(["article.json", "page.json"]);
    expect(await readFile(join(path, "types", "page.json"), "utf8")).toBe(
      '{\n  "id": "p1",\n  "codename": "page"\n}\n',
    );

    const typeRequests = requests.filter((request) => request.url.pathname.endsWith("/types"));
    expect(typeRequests).toHaveLength(2);
    expect(typeRequests[1]?.requestHeaders).toContainEqual({
      name: "X-Continuation",
      value: "token-2",
    });
    expect(
      requests.every((request) =>
        (request.requestHeaders ?? []).some(
          (header) => header.name === "Authorization" && header.value === "Bearer secret-key",
        ),
      ),
    ).toBe(true);
  });
});
