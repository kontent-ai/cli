import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, onTestFinished } from "vitest";

// A usage error never reaches a command, so its exit code is set by src/index.ts and only
// a real process shows it. Runs the source through tsx, like stdout.test.ts.
const runCli = async (
  args: ReadonlyArray<string>,
  homeDir: string,
): Promise<Readonly<{ exitCode: number; stderr: string }>> =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", entryPath, ...args], {
      env: {
        ...(process.env.PATH === undefined ? {} : { PATH: process.env.PATH }),
        HOME: homeDir,
        XDG_CONFIG_HOME: homeDir,
        APPDATA: homeDir,
        DO_NOT_TRACK: "1",
        NO_COLOR: "1",
      },
      stdio: ["ignore", "ignore", "pipe"],
    });

    const stderr: Buffer[] = [];
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));

    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ exitCode: code ?? -1, stderr: Buffer.concat(stderr).toString() });
    });
  });

const entryPath = fileURLToPath(new URL("../../src/index.ts", import.meta.url));

describe("a usage error", () => {
  // tsx compiles the CLI's import graph on every spawn; see stdout.test.ts for the timeout.
  it.each([
    { name: "an unknown flag", args: ["--bogus"], hint: "Run `kontent --help` for usage." },
    {
      name: "a failed .check()",
      args: ["mapi", "types", "--envId", " "],
      hint: "Run `kontent mapi --help` for usage.",
    },
  ])("exits 2 for $name and prints the help hint once", async ({ args, hint }) => {
    const homeDir = await mkdtemp(join(tmpdir(), "kontent-usage-"));
    onTestFinished(async () => rm(homeDir, { recursive: true, force: true }));

    const result = await runCli(args, homeDir);

    expect(result.exitCode).toBe(2);
    expect(result.stderr.split(hint)).toHaveLength(2);
  }, 30_000);
});
