import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { files } from "../../src/cli/adapters/files/files.js";
import { none, some } from "../../src/core/lib/option.js";
import { ok } from "../../src/core/lib/result.js";

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
