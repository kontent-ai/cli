import {
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { files } from "../../src/cli/adapters/files/files.js";
import { none, some } from "../../src/core/lib/option.js";
import { ok } from "../../src/core/lib/result.js";
import { assertErr, assertOk } from "../helpers/assertResult.js";

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
});

describe("files.writeTextAtomic", () => {
  let tempDir: string;

  beforeAll(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "kontent-atomic-"));
  });

  afterAll(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await rm(join(tempDir, "work"), { recursive: true, force: true });
    await mkdir(join(tempDir, "work"));
  });

  it("creates missing folders and replaces the file without leaving a temp file behind", async () => {
    const filePath = join(tempDir, "work", "nested", "config.json");
    await mkdir(join(tempDir, "work", "nested"));
    await writeFile(filePath, "old");

    assertOk(await files.writeTextAtomic(filePath, "new"));

    expect(await readFile(filePath, "utf8")).toBe("new");
    expect(await readdir(join(tempDir, "work", "nested"))).toEqual(["config.json"]);
  });

  it.skipIf(process.platform === "win32")(
    "leaves the file readable by its owner only",
    async () => {
      const filePath = join(tempDir, "work", "deep", "config.json");

      assertOk(await files.writeTextAtomic(filePath, "secret"));

      expect((await stat(filePath)).mode & 0o777).toBe(0o600);
    },
  );

  it("writes through a symlink and keeps the link", async () => {
    const realFile = join(tempDir, "work", "dotfiles", "kontent-cli.json");
    const linkPath = join(tempDir, "work", "config.json");
    await mkdir(join(tempDir, "work", "dotfiles"));
    await writeFile(realFile, "old");
    await symlink(realFile, linkPath);

    assertOk(await files.writeTextAtomic(linkPath, "new"));

    expect((await lstat(linkPath)).isSymbolicLink()).toBe(true);
    expect(await readFile(realFile, "utf8")).toBe("new");
    expect(await readdir(join(tempDir, "work", "dotfiles"))).toEqual(["kontent-cli.json"]);
  });

  it("follows a chain of links to the missing file at its end", async () => {
    const linkPath = join(tempDir, "work", "cli", "config.json");
    const middle = join(tempDir, "work", "dotfiles", "middle.json");
    await mkdir(join(tempDir, "work", "cli"));
    await mkdir(join(tempDir, "work", "dotfiles"));
    await symlink(join("..", "dotfiles", "middle.json"), linkPath);
    await symlink(join("..", "store", "kontent-cli.json"), middle);

    assertOk(await files.writeTextAtomic(linkPath, "new"));

    expect((await lstat(linkPath)).isSymbolicLink()).toBe(true);
    expect((await lstat(middle)).isSymbolicLink()).toBe(true);
    expect(await readFile(join(tempDir, "work", "store", "kontent-cli.json"), "utf8")).toBe("new");
    expect(await readdir(join(tempDir, "work", "store"))).toEqual(["kontent-cli.json"]);
  });

  it("removes the temp file when the final rename fails", async () => {
    const occupied = join(tempDir, "work", "config.json");
    await mkdir(join(occupied, "child"), { recursive: true });

    assertErr(await files.writeTextAtomic(occupied, "new"));

    expect(await readdir(join(tempDir, "work"))).toEqual(["config.json"]);
  });
});
