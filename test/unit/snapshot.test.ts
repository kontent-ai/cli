import { basename, dirname, join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { RawResponse } from "../../src/cli/adapters/http/rawClient.js";
import {
  type SnapshotEffects,
  type SnapshotInput,
  snapshot,
} from "../../src/cli/commands/model/snapshot/runSnapshot.js";
import type { Logger } from "../../src/cli/log.js";
import { fromNullable, none, some } from "../../src/core/lib/option.js";
import { err, ok } from "../../src/core/lib/result.js";
import { snapshotFileText } from "../../src/core/snapshot/fileText.js";
import { buildSnapshotManifest } from "../../src/core/snapshot/manifest.js";
import { assertOk } from "../helpers/assertResult.js";

const ENV_ID = "11111111-2222-3333-4444-555555555555";
const LANGUAGE_ID = "6e3c0c8a-2d4b-4f53-9c1e-0a7b5d9e2f11";
const ROOT = "snapshot";
const LAST_PAGE = { continuation_token: null, next_page: null };

const ENVIRONMENT = { id: ENV_ID, name: "Site", environment: "Production", is_production: true };
const ARTICLE = { id: "a1", codename: "article", name: "Article" };
const PAGE = { id: "p1", codename: "page", name: "Page" };
const LANGUAGE = { id: LANGUAGE_ID, codename: "default", name: "Default" };
const COLLECTION = { id: "c1", codename: "default", name: "Default" };
const WORKFLOW = { id: "w1", codename: "default", name: "Default" };

const response = (payload: RawResponse["payload"], status = 200): RawResponse => ({
  status,
  statusText: status === 200 ? "OK" : "Error",
  responseHeaders: [],
  payload,
});

const listing = (key: string, entities: ReadonlyArray<object>, pagination: object = LAST_PAGE) =>
  response({ [key]: [...entities], pagination } as RawResponse["payload"]);

/** Each endpoint's pages, keyed by the last segment of its path ("" for the environment). */
type Pages = Readonly<Record<string, ReadonlyArray<RawResponse | string>>>;

const DEFAULT_PAGES: Pages = {
  "": [response(ENVIRONMENT)],
  types: [listing("types", [ARTICLE])],
  snippets: [listing("snippets", [])],
  taxonomies: [listing("taxonomies", [])],
  languages: [listing("languages", [LANGUAGE])],
  collections: [response({ collections: [COLLECTION], last_modified: "2026-01-01" })],
  workflows: [response([WORKFLOW])],
};

const endpointKey = (url: URL): string => {
  const segments = url.pathname.split("/");
  const last = segments.at(-1) ?? "";
  return last === ENV_ID ? "" : last;
};

const fakeMapi = (pages: Pages) => ({
  pages: vi.fn(async function* (request: Readonly<{ url: URL }>, _token: string | undefined) {
    yield* (pages[endpointKey(request.url)] ?? []).map((page) =>
      typeof page === "string" ? err(page) : ok(page),
    );
  }),
});

/** A folder tree in memory: file paths to text, plus the folders that exist. */
const memoryFiles = (initial: Readonly<Record<string, string>>) => {
  const texts = new Map(Object.entries(initial).map(([path, text]) => [join(ROOT, path), text]));
  const folders = new Set([...texts.keys()].flatMap((path) => [dirname(path), ROOT]));
  const children = (dir: string) =>
    [...new Set([...texts.keys(), ...folders])]
      .filter((path) => path !== dir && dirname(path) === dir)
      .map((path) => basename(path));

  const fileAccess = {
    entries: vi.fn((dir: string) =>
      Promise.resolve(ok(folders.has(dir) ? some(children(dir)) : none)),
    ),
    readText: vi.fn((path: string) => Promise.resolve(ok(fromNullable(texts.get(path))))),
    writeText: vi.fn((path: string, text: string) => {
      texts.set(path, text);
      return Promise.resolve(ok(undefined));
    }),
    makeDir: vi.fn((dir: string) => {
      folders.add(dir);
      return Promise.resolve(ok(undefined));
    }),
    removeFile: vi.fn((path: string) => {
      texts.delete(path);
      return Promise.resolve(ok(undefined));
    }),
  } satisfies SnapshotEffects["files"];

  const read = (path: string) => texts.get(join(ROOT, path));
  return { fileAccess, read, paths: () => [...texts.keys()].sort() };
};

const fakeLogger: Logger = { info: () => {}, warning: () => {}, error: () => {}, isVerbose: false };

const fakeEffects = (
  options: Readonly<{ pages?: Pages; files?: Readonly<Record<string, string>> }> = {},
) => {
  const fs = memoryFiles(options.files ?? {});
  const effects = {
    logger: fakeLogger,
    config: { read: vi.fn(() => Promise.resolve({ envId: undefined })) },
    session: { tokens: vi.fn(() => Promise.resolve(ok({ accessToken: "login-token" }))) },
    mapi: fakeMapi(options.pages ?? DEFAULT_PAGES),
    files: fs.fileAccess,
  } satisfies SnapshotEffects;
  return { effects, fs };
};

const input = (overrides: Partial<SnapshotInput> = {}): SnapshotInput => ({
  path: ROOT,
  baseUrl: "https://manage.test/v2",
  envId: ENV_ID,
  ...overrides,
});

const MANIFEST = snapshotFileText(buildSnapshotManifest(ENV_ID));

/** What a first run against DEFAULT_PAGES writes, relative to the snapshot folder. */
const FULL_SNAPSHOT = {
  "manifest.json": MANIFEST,
  "environment.json": snapshotFileText(ENVIRONMENT),
  "types/article.json": snapshotFileText(ARTICLE),
  [`languages/${LANGUAGE_ID}.json`]: snapshotFileText(LANGUAGE),
  "collections/default.json": snapshotFileText(COLLECTION),
  "workflows/default.json": snapshotFileText(WORKFLOW),
};

describe("snapshot", () => {
  it("writes a whole snapshot into a missing folder, the manifest first", async () => {
    const { effects, fs } = fakeEffects();

    const result = await snapshot(effects, input());

    assertOk(result);
    expect(result.value).toMatchObject({ manifest: MANIFEST, written: 6, deleted: 0 });
    expect(fs.paths()).toEqual(
      Object.keys(FULL_SNAPSHOT)
        .map((p) => join(ROOT, p))
        .sort(),
    );
    expect(fs.read("types/article.json")).toBe(snapshotFileText(ARTICLE));
    expect(effects.files.writeText.mock.calls[0]?.[0]).toBe(join(ROOT, "manifest.json"));
    expect(effects.mapi.pages.mock.calls.every(([, token]) => token === "login-token")).toBe(true);
  });

  it("writes nothing when the environment didn't change", async () => {
    const { effects } = fakeEffects({ files: FULL_SNAPSHOT });

    const result = await snapshot(effects, input());

    assertOk(result);
    expect(result.value).toMatchObject({ written: 0, deleted: 0, unchanged: 6 });
    expect(effects.files.writeText).not.toHaveBeenCalled();
    expect(effects.files.removeFile).not.toHaveBeenCalled();
  });

  it("writes a changed file and removes the file of a deleted entity", async () => {
    const { effects, fs } = fakeEffects({
      files: {
        ...FULL_SNAPSHOT,
        "types/article.json": snapshotFileText({ ...ARTICLE, name: "Old name" }),
        "types/page.json": snapshotFileText(PAGE),
      },
    });

    const result = await snapshot(effects, input());

    assertOk(result);
    expect(result.value).toMatchObject({ written: 1, deleted: 1 });
    expect(fs.read("types/article.json")).toBe(snapshotFileText(ARTICLE));
    expect(fs.read("types/page.json")).toBeUndefined();
  });

  it("leaves files that aren't snapshot files alone", async () => {
    const { effects, fs } = fakeEffects({
      files: { ...FULL_SNAPSHOT, "notes.md": "notes", "types/readme.txt": "readme" },
    });

    assertOk(await snapshot(effects, input()));
    expect(fs.read("notes.md")).toBe("notes");
    expect(fs.read("types/readme.txt")).toBe("readme");
  });

  it("collects every page of a paged kind", async () => {
    const { effects, fs } = fakeEffects({
      pages: {
        ...DEFAULT_PAGES,
        types: [
          listing("types", [ARTICLE], { continuation_token: "t2", next_page: "https://next" }),
          listing("types", [PAGE]),
        ],
      },
    });

    assertOk(await snapshot(effects, input()));
    expect(fs.read("types/article.json")).toBe(snapshotFileText(ARTICLE));
    expect(fs.read("types/page.json")).toBe(snapshotFileText(PAGE));
  });

  it("writes and deletes nothing when one request fails", async () => {
    const { effects } = fakeEffects({
      files: { ...FULL_SNAPSHOT, "types/page.json": snapshotFileText(PAGE) },
      pages: { ...DEFAULT_PAGES, workflows: [response({ message: "Forbidden" }, 403)] },
    });

    const result = await snapshot(effects, input());

    expect(result).toMatchObject(err({ kind: "http-failure", kindName: "workflows", status: 403 }));
    expect(effects.files.writeText).not.toHaveBeenCalled();
    expect(effects.files.removeFile).not.toHaveBeenCalled();
  });

  it("writes and deletes nothing on a transport failure", async () => {
    const { effects } = fakeEffects({ pages: { ...DEFAULT_PAGES, types: ["socket hang up"] } });

    const result = await snapshot(effects, input());

    expect(result).toMatchObject(err({ kind: "transport", kindName: "types" }));
    expect(effects.files.writeText).not.toHaveBeenCalled();
  });

  it("refuses a folder that isn't a snapshot without fetching anything", async () => {
    const { effects } = fakeEffects({ files: { "package.json": "{}" } });

    const result = await snapshot(effects, input());

    expect(result).toEqual(err({ kind: "refused-target", reason: "has-other-files" }));
    expect(effects.mapi.pages).not.toHaveBeenCalled();
    expect(effects.files.writeText).not.toHaveBeenCalled();
  });

  it("fetches nothing without an environment", async () => {
    const { effects } = fakeEffects();

    const result = await snapshot(effects, input({ envId: undefined }));

    expect(result).toEqual(err({ kind: "missing-env-id" }));
    expect(effects.mapi.pages).not.toHaveBeenCalled();
  });

  it("uses a supplied key without touching the login session", async () => {
    const { effects } = fakeEffects();

    const result = await snapshot(effects, input({ mapiKey: "secret" }));

    assertOk(result);
    expect(result.value.authSource).toBe("mapi-key");
    expect(effects.session.tokens).not.toHaveBeenCalled();
    expect(effects.mapi.pages.mock.calls.every(([, token]) => token === "secret")).toBe(true);
  });
});
