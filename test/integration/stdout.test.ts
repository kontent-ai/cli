import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// A closed pipe exists only between two processes, so this test spawns one. It
// runs the source through tsx rather than dist/, which is gitignored and not
// built by `pnpm test`: a bundle-based test would fail on CI for a missing
// artifact and pass locally against a stale one. Bundling goes untested here;
// the e2e suite covers it.
const runWithClosedStdout = (
  args: ReadonlyArray<string>,
): Promise<Readonly<{ exitCode: number; stderr: string }>> =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", entryPath, ...args], {
      env: {
        ...(process.env.PATH === undefined ? {} : { PATH: process.env.PATH }),
        ...(process.env.HOME === undefined ? {} : { HOME: process.env.HOME }),
        DO_NOT_TRACK: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    // Closing the read end first: reproducing `... | head` otherwise needs a payload
    // bigger than the pipe buffer, which this command's output never is.
    child.stdout.destroy();

    const stderr: Buffer[] = [];
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));

    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ exitCode: code ?? -1, stderr: Buffer.concat(stderr).toString() });
    });
  });

const entryPath = fileURLToPath(new URL("../../src/index.ts", import.meta.url));

// `telemetry status` writes to stdout and talks to nothing, so a failure here is
// the pipe handling and not the network.
describe("a reader that closes the pipe early", () => {
  // tsx compiles the CLI's import graph on every spawn - about a second idle, but
  // CPU-bound, so a loaded machine stretches it well past the 5s default.
  it("does not turn into an EPIPE crash", async () => {
    const result = await runWithClosedStdout(["telemetry", "status"]);

    // The exit code is the real check - an unhandled stream error is fatal. The
    // EPIPE match only names the bug in the failure message.
    expect(result.stderr).not.toContain("EPIPE");
    expect(result.exitCode).toBe(0);
  }, 30_000);
});
