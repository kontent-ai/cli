import { exec } from "node:child_process";
import { mkdir, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

// Packs the CLI the way the release publishes it (`pnpm pack` builds through
// `prepare`) and installs the tarball the way users do, so the suite runs
// exactly what ships.
export const packAndInstallCli = async (): Promise<string> => {
  await rm(installDir, { recursive: true, force: true });
  await mkdir(installDir, { recursive: true });
  await execAsync(`pnpm pack --pack-destination "${installDir}"`, { cwd: repoRoot });

  const tarball = (await readdir(installDir)).find((name) => name.endsWith(".tgz"));
  if (tarball === undefined) {
    throw new Error(`pnpm pack wrote no tarball to ${installDir}.`);
  }
  await execAsync(
    `npm install --prefix "${installDir}" --no-audit --no-fund "${join(installDir, tarball)}"`,
  );

  return join(installDir, "node_modules", "@kontent-ai", "cli", "dist", "index.mjs");
};

// exec rather than execFile: on Windows pnpm and npm are .cmd shims, which only
// a shell can run.
const execAsync = promisify(exec);

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));

// Fixed and wiped at the start of each run, not in teardown: Vitest exits on
// Ctrl+C without running teardown, so a per-run dir would leak a full install
// every time. Outside the repo so that a dependency the package forgot to
// declare cannot resolve from the repo's own node_modules.
const installDir = join(tmpdir(), "kontent-e2e-cli");
