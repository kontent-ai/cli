import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { files } from "../../src/cli/adapters/files/files.js";
import { none, some } from "../../src/core/lib/option.js";
import { isErr, ok } from "../../src/core/lib/result.js";

describe("files", () => {
  let tempDir: string;

  beforeAll(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "kontent-project-"));
    await writeFile(join(tempDir, "existing.txt"), "hello", "utf8");
  });

  afterAll(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("lists the entries of an existing directory", async () => {
    expect(await files.entries(tempDir)).toEqual(ok(some(["existing.txt"])));
  });

  it("treats a missing directory as none rather than an error", async () => {
    expect(await files.entries(join(tempDir, "absent"))).toEqual(ok(none));
  });

  it("treats a missing file as none rather than an error", async () => {
    expect(await files.readText(join(tempDir, "absent.txt"))).toEqual(ok(none));
  });

  it("creates a folder with its missing parents, and accepts one that exists", async () => {
    const dir = join(tempDir, "snapshot", "types");

    expect(await files.makeDir(dir)).toEqual(ok(undefined));
    expect(await files.makeDir(dir)).toEqual(ok(undefined));
    expect(await readdir(join(tempDir, "snapshot"))).toEqual(["types"]);
  });

  it("writes text as UTF-8 without a BOM and with the line endings it was given", async () => {
    const filePath = join(tempDir, "written.json");
    const text = '{\n  "codename": "French_–_Switzerland"\n}\n';

    expect(await files.writeText(filePath, text)).toEqual(ok(undefined));
    expect(await readFile(filePath)).toEqual(Buffer.from(text, "utf8"));
  });

  it("removes a file", async () => {
    const filePath = join(tempDir, "removed.json");
    await writeFile(filePath, "{}", "utf8");

    expect(await files.removeFile(filePath)).toEqual(ok(undefined));
    expect(await files.readText(filePath)).toEqual(ok(none));
  });

  it("treats removing a missing file as done", async () => {
    expect(await files.removeFile(join(tempDir, "never-there.json"))).toEqual(ok(undefined));
  });

  it("refuses to remove a folder", async () => {
    const dir = join(tempDir, "kept");
    await mkdir(dir);

    expect(isErr(await files.removeFile(dir))).toBe(true);
    expect(await files.entries(dir)).toEqual(ok(some([])));
  });
});
