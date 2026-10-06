import { spawn } from "node:child_process";
import type { JsonValue } from "@kontent-ai/core-sdk";
import { inject } from "vitest";

export type CliResult = Readonly<{
  exitCode: number;
  stdout: string;
  stderr: string;
}>;

export type CliRunOptions = Readonly<{
  stdin?: string;
  env?: Readonly<Record<string, string>>;
}>;

// Spawns the built binary with a curated environment: only the vars the CLI
// actually reads, telemetry off, so a developer's shell cannot steer a run.
// Resolves on any exit code - a non-zero exit is a result the tests assert on.
export const runCli = (
  args: ReadonlyArray<string>,
  options: CliRunOptions = {},
): Promise<CliResult> =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [inject("e2e").cliEntry, ...args], {
      env: { ...curatedEnv(), ...options.env },
      stdio: ["pipe", "pipe", "pipe"],
    });

    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));

    child.on("error", reject);
    child.on("close", (code) => {
      resolve({
        exitCode: code ?? -1,
        stdout: Buffer.concat(stdout).toString(),
        stderr: Buffer.concat(stderr).toString(),
      });
    });

    // The CLI may exit before reading stdin (a rejected argument, say). Without a
    // listener the resulting EPIPE would take down the test worker.
    child.stdin.on("error", () => {});
    if (options.stdin !== undefined) {
      child.stdin.write(options.stdin);
    }
    child.stdin.end();
  });

// The stdout-purity assertion in one place: anything but a clean JSON payload
// on stdout fails here with the raw output in the message.
export const parseStdout = (result: CliResult): JsonValue => {
  try {
    return JSON.parse(result.stdout) as JsonValue;
  } catch {
    throw new Error(`stdout is not valid JSON:\n${result.stdout}`);
  }
};

// USERPROFILE and APPDATA are the Windows counterparts of HOME for the home and
// config directories; SystemRoot is needed by Node networking on Windows.
const passedThroughVars = [
  "PATH",
  "HOME",
  "USERPROFILE",
  "APPDATA",
  "SystemRoot",
  "KONTENT_URL",
] as const;

const curatedEnv = (): Record<string, string> => ({
  ...Object.fromEntries(
    passedThroughVars.flatMap((name) => {
      const value = process.env[name];
      return value === undefined ? [] : [[name, value]];
    }),
  ),
  DO_NOT_TRACK: "1",
});
