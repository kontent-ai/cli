import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { cliConfigStore } from "../../src/cli/adapters/config/cliConfig.js";

describe("cli config store", () => {
  let configHome: string;

  beforeAll(async () => {
    configHome = await mkdtemp(join(tmpdir(), "kontent-config-"));
    vi.stubEnv("XDG_CONFIG_HOME", configHome);
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    await rm(configHome, { recursive: true, force: true });
  });

  // A hand-edited value must never reach a request URL.
  it("reads back a stored environment id only when it is a GUID", async () => {
    const dir = join(configHome, "kontent", "cli");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "config.json"), JSON.stringify({ envId: "../projects/other" }));

    expect((await cliConfigStore.read()).envId).toBeUndefined();
  });
});
