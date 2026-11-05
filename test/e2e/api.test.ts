import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, inject, it } from "vitest";
import { randomSuffix } from "../helpers/environment.js";
import { requireE2eConfig } from "./helpers/config.js";
import { type CliResult, type CliRunOptions, parseStdout, runCli } from "./helpers/runCli.js";

const config = requireE2eConfig();
const { envId } = inject("e2e");

const runSuffix = randomSuffix();
const taxonomyCodename = `colors_${runSuffix}`;
const typeCodename = `article_${runSuffix}`;
const itemCodename = `hello_${runSuffix}`;
const secondItemCodename = `second_${runSuffix}`;

const DELIVERY_POLL_ATTEMPTS = 15;
const DELIVERY_POLL_INTERVAL_MS = 2_000;
const DELIVERY_POLL_TIMEOUT_MS = DELIVERY_POLL_ATTEMPTS * (DELIVERY_POLL_INTERVAL_MS + 5_000);

const imageFixturePath = fileURLToPath(new URL("./fixtures/kailogo.png", import.meta.url));

describe("kontent mapi and dapi e2e", () => {
  let itemId: string;
  let secondItemId: string;
  let assetId: string;

  const mapi = (endpoint: string, extraArgs: ReadonlyArray<string> = [], options?: CliRunOptions) =>
    runCli(
      ["mapi", endpoint, "--envId", envId, "--mapiKey", config.mapiKey, ...extraArgs],
      options,
    );

  const dapi = (endpoint: string, extraArgs: ReadonlyArray<string> = []) =>
    runCli(["dapi", endpoint, "--envId", envId, ...extraArgs]);

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

  it("publishes the variant", async () => {
    const result = await mapi(`items/${itemId}/variants/codename/default/publish`, ["-X", "PUT"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("");
  });

  it(
    "serves the published item through Delivery",
    async () => {
      const result = await pollUntil(
        () => dapi(`items/${itemCodename}`, ["--waitForNewContent"]),
        hasLeftPropagation,
      );

      expect(result.exitCode).toBe(0);
      expect(parseStdout(result)).toMatchObject({
        item: {
          system: { codename: itemCodename },
          elements: {
            title: { value: "Hello world" },
            image: { value: [expect.anything()] },
          },
        },
      });
    },
    DELIVERY_POLL_TIMEOUT_MS,
  );

  it("filters items with a query string", async () => {
    const result = await dapi(`items?system.type=${typeCodename}`, ["--waitForNewContent"]);

    expect(result.exitCode).toBe(0);
    expect(parseStdout(result)).toMatchObject({
      items: [{ system: { codename: itemCodename } }],
    });
  });

  it("publishes a second item to page through", async () => {
    const created = await mapi("items", ["--input", "-"], {
      stdin: JSON.stringify({
        name: `Second ${runSuffix}`,
        codename: secondItemCodename,
        type: { codename: typeCodename },
      }),
    });
    expect(created.exitCode).toBe(0);
    secondItemId = (parseStdout(created) as { id: string }).id;

    const variant = await mapi(
      `items/${secondItemId}/variants/codename/default`,
      ["-X", "PUT", "--input", "-"],
      {
        stdin: JSON.stringify({ elements: [{ element: { codename: "title" }, value: "Second" }] }),
      },
    );
    expect(variant.exitCode).toBe(0);

    const published = await mapi(`items/${secondItemId}/variants/codename/default/publish`, [
      "-X",
      "PUT",
    ]);
    expect(published.exitCode).toBe(0);
  });

  it(
    "follows next_page with --paginate --slurp, one item per page",
    async () => {
      const result = await pollUntil(
        () =>
          dapi(`items?system.type=${typeCodename}&limit=1`, [
            "--paginate",
            "--slurp",
            "--waitForNewContent",
          ]),
        (run) => run.exitCode !== 0 || (parseStdout(run) as ReadonlyArray<unknown>).length === 2,
      );

      expect(result.exitCode).toBe(0);
      const pages = parseStdout(result) as ReadonlyArray<
        Readonly<{ items: ReadonlyArray<Readonly<{ system: Readonly<{ codename: string }> }>> }>
      >;
      expect(pages).toHaveLength(2);
      expect(
        pages.flatMap((page) => page.items.map((item) => item.system.codename)).sort(),
      ).toEqual([itemCodename, secondItemCodename].sort());
    },
    DELIVERY_POLL_TIMEOUT_MS,
  );

  it("reports a missing item as a 404 payload with exit code 1", async () => {
    const result = await dapi(`items/missing_${runSuffix}`);

    expect(result.exitCode).toBe(1);
    expect(parseStdout(result)).toMatchObject({ message: expect.any(String) });
    expect(result.stderr).toContain("HTTP 404");
  });

  it("prints the status line and headers with --include", async () => {
    const result = await mapi(`items/${itemId}`, ["--include"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/^HTTP 200\b/);

    const [head, body] = splitOnce(result.stdout, "\n\n");
    expect(head).toMatch(/\ncontent-type: /i);
    expect(JSON.parse(body)).toMatchObject({ id: itemId });
  });

  it("unpublishes the variants", async () => {
    const results = await Promise.all(
      [itemId, secondItemId].map((id) =>
        mapi(`items/${id}/variants/codename/default/unpublish`, ["-X", "PUT"]),
      ),
    );

    expect(results.map((result) => [result.exitCode, result.stdout])).toEqual([
      [0, ""],
      [0, ""],
    ]);
  });

  it("deletes the items", async () => {
    const results = await Promise.all(
      [itemId, secondItemId].map((id) => mapi(`items/${id}`, ["-X", "DELETE"])),
    );

    expect(results.map((result) => [result.exitCode, result.stdout])).toEqual([
      [0, ""],
      [0, ""],
    ]);
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

// Publishing reaches Delivery asynchronously, so the first reads can still miss it.
const pollUntil = (
  run: () => Promise<CliResult>,
  isReady: (result: CliResult) => boolean,
): Promise<CliResult> => {
  const attempt = async (remaining: number): Promise<CliResult> => {
    const result = await run();
    if (isReady(result) || remaining <= 1) {
      return result;
    }
    await sleep(DELIVERY_POLL_INTERVAL_MS);
    return attempt(remaining - 1);
  };
  return attempt(DELIVERY_POLL_ATTEMPTS);
};

// Only a 404 means the item is still on its way; any other failure is final.
const hasLeftPropagation = (result: CliResult): boolean =>
  result.exitCode === 0 || !result.stderr.includes("HTTP 404");
