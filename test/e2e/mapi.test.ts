import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isNone } from "../../src/lib/option.js";
import { type E2eConfig, readE2eConfig } from "./helpers/config.js";
import {
  cloneTestEnvironment,
  deleteTestEnvironment,
  recordEnvironmentId,
  type TestEnvironment,
} from "./helpers/environment.js";
import { randomSuffix } from "./helpers/random.js";
import { type CliRunOptions, parseStdout, runCli } from "./helpers/runCli.js";

const config = readE2eConfig();

const runSuffix = randomSuffix();
const taxonomyCodename = `colors_${runSuffix}`;
const typeCodename = `article_${runSuffix}`;
const itemCodename = `hello_${runSuffix}`;

const imageFixturePath = fileURLToPath(new URL("./fixtures/kailogo.png", import.meta.url));

describe.skipIf(isNone(config))("kontent mapi e2e", () => {
  let env: TestEnvironment | undefined;
  let itemId: string;
  let assetId: string;

  // The describe body runs at collection time even when the suite is skipped,
  // so the config unwrap has to wait until the hooks.
  const requireConfig = (): E2eConfig => {
    if (isNone(config)) {
      throw new Error("E2E config missing despite the skipIf gate.");
    }
    return config.value;
  };

  const requireEnv = (): TestEnvironment => {
    if (env === undefined) {
      throw new Error("The test environment was not cloned.");
    }
    return env;
  };

  const mapi = (endpoint: string, extraArgs: ReadonlyArray<string> = [], options?: CliRunOptions) =>
    runCli(
      [
        "mapi",
        endpoint,
        "--envId",
        requireEnv().envId,
        "--mapiKey",
        requireConfig().mapiKey,
        ...extraArgs,
      ],
      options,
    );

  beforeAll(async () => {
    env = await cloneTestEnvironment(requireConfig());
    await recordEnvironmentId(env.envId);
  });

  afterAll(async () => {
    if (env !== undefined) {
      await deleteTestEnvironment(requireConfig(), env.envId);
    }
  });

  it("starts from an empty clone", async () => {
    const types = await mapi("types");
    const items = await mapi("items");

    expect(types.exitCode).toBe(0);
    expect(items.exitCode).toBe(0);
    expect(parseStdout(types)).toMatchObject({ types: [] });
    expect(parseStdout(items)).toMatchObject({ items: [] });
  });

  it("creates a taxonomy from a body file (implicit POST)", async () => {
    const bodyDir = await mkdtemp(join(tmpdir(), "kontent-e2e-"));
    const bodyPath = join(bodyDir, "taxonomy.json");
    await writeFile(
      bodyPath,
      JSON.stringify({
        name: `Colors ${runSuffix}`,
        codename: taxonomyCodename,
        terms: [{ name: "Red", codename: `red_${runSuffix}`, terms: [] }],
      }),
    );

    const result = await mapi("taxonomies", ["--input", bodyPath]);

    expect(result.exitCode).toBe(0);
    expect(parseStdout(result)).toMatchObject({ codename: taxonomyCodename });
  });

  it("creates a content type from stdin (implicit POST)", async () => {
    const body = JSON.stringify({
      name: `Article ${runSuffix}`,
      codename: typeCodename,
      elements: [
        { type: "text", name: "Title", codename: "title" },
        { type: "asset", name: "Image", codename: "image" },
      ],
    });

    const result = await mapi("types", ["--input", "-"], { stdin: body });

    expect(result.exitCode).toBe(0);
    expect(parseStdout(result)).toMatchObject({ codename: typeCodename });
  });

  it("uploads a binary file and creates an asset from it", async () => {
    const uploaded = await mapi("files/kailogo.png", [
      "--input",
      imageFixturePath,
      "-H",
      "Content-Type: image/png",
    ]);

    expect(uploaded.exitCode).toBe(0);
    const fileReferenceId = (parseStdout(uploaded) as { id: string }).id;
    expect(fileReferenceId).toBeTruthy();

    const asset = await mapi("assets", ["--input", "-"], {
      stdin: JSON.stringify({
        file_reference: { id: fileReferenceId, type: "internal" },
        title: `Asset ${runSuffix}`,
      }),
    });

    expect(asset.exitCode).toBe(0);
    assetId = (parseStdout(asset) as { id: string }).id;
    expect(assetId).toBeTruthy();
  });

  it("creates an item and upserts its language variant with -X PUT", async () => {
    const created = await mapi("items", ["--input", "-"], {
      stdin: JSON.stringify({
        name: `Hello ${runSuffix}`,
        codename: itemCodename,
        type: { codename: typeCodename },
      }),
    });

    expect(created.exitCode).toBe(0);
    itemId = (parseStdout(created) as { id: string }).id;
    expect(itemId).toBeTruthy();

    const variant = await mapi(
      `items/${itemId}/variants/codename/default`,
      ["-X", "PUT", "--input", "-"],
      {
        stdin: JSON.stringify({
          elements: [
            { element: { codename: "title" }, value: "Hello world" },
            { element: { codename: "image" }, value: [{ id: assetId }] },
          ],
        }),
      },
    );

    expect(variant.exitCode).toBe(0);
    expect(parseStdout(variant)).toMatchObject({ item: { id: itemId } });
  });

  it("prints the status line and headers with --include", async () => {
    const result = await mapi(`items/${itemId}`, ["--include"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/^HTTP\/1\.1 200 OK\n/);

    const [head, body] = splitOnce(result.stdout, "\n\n");
    expect(head).toMatch(/\ncontent-type: /i);
    expect(JSON.parse(body)).toMatchObject({ id: itemId });
  });

  it("deletes the item", async () => {
    const result = await mapi(`items/${itemId}`, ["-X", "DELETE"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("");
  });

  it("reports the deleted item as a 404 payload with exit code 1", async () => {
    const result = await mapi(`items/${itemId}`);

    expect(result.exitCode).toBe(1);
    expect(parseStdout(result)).toMatchObject({ message: expect.any(String) });
    expect(result.stderr).toContain("HTTP 404");
  });

  it("keeps the created model and asset, and no items", async () => {
    const types = await mapi("types");
    const taxonomies = await mapi("taxonomies");
    const assets = await mapi("assets");
    const items = await mapi("items");

    expect(parseStdout(types)).toMatchObject({
      types: [expect.objectContaining({ codename: typeCodename })],
    });
    expect(parseStdout(taxonomies)).toMatchObject({
      taxonomies: [expect.objectContaining({ codename: taxonomyCodename })],
    });
    expect(parseStdout(assets)).toMatchObject({
      assets: [expect.objectContaining({ id: assetId })],
    });
    expect(parseStdout(items)).toMatchObject({ items: [] });
  });
});

const splitOnce = (text: string, separator: string): readonly [string, string] => {
  const index = text.indexOf(separator);
  return index === -1 ? [text, ""] : [text.slice(0, index), text.slice(index + separator.length)];
};
