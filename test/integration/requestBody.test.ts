import { execFile } from "node:child_process";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createRequestBodyReader } from "../../src/cli/adapters/input/requestBody.js";
import { assertErr, assertOk } from "../helpers/assertResult.js";

const pipedStdin = (text: string) => Readable.from([text]);
const terminalStdin = () => Object.assign(Readable.from([]), { isTTY: true });

describe("request body reader", () => {
  let tempDir: string;

  beforeAll(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "kontent-body-"));
  });

  afterAll(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("reads a file", async () => {
    const path = join(tempDir, "body.json");
    await writeFile(path, '{"name":"Article"}');

    const result = await createRequestBodyReader(pipedStdin("")).read(path);

    assertOk(result);
    expect(await result.value.text()).toBe('{"name":"Article"}');
  });

  it.skipIf(process.platform === "win32")("drains a named pipe", async () => {
    const path = join(tempDir, "body.pipe");
    await promisify(execFile)("mkfifo", [path]);

    // The writer's open blocks until the reader opens the read end, so both run at once.
    const [, result] = await Promise.all([
      writeFile(path, '{"name":"Article"}'),
      createRequestBodyReader(pipedStdin("")).read(path),
    ]);

    assertOk(result);
    expect(await result.value.text()).toBe('{"name":"Article"}');
  });

  it("drains piped stdin for -", async () => {
    const result = await createRequestBodyReader(pipedStdin('{"name":"Piped"}')).read("-");

    assertOk(result);
    expect(await result.value.text()).toBe('{"name":"Piped"}');
  });

  it("refuses - when nothing is piped to stdin", async () => {
    const result = await createRequestBodyReader(terminalStdin()).read("-");

    assertErr(result);
    expect(result.error.message).toContain("Nothing is piped to stdin");
  });

  it("reports a missing file with its path and errno", async () => {
    // Inside the suite's temp dir, so "missing" is a fact rather than a guess about /tmp.
    const path = join(tempDir, "absent", "body.json");

    const result = await createRequestBodyReader(pipedStdin("")).read(path);

    assertErr(result);
    expect(result.error.message).toContain(path);
    expect(result.error.message).toContain("ENOENT");
  });

  // Root ignores the mode bits, so the file would open either way.
  it.skipIf(process.getuid?.() === 0)("reports a file it may not read", async () => {
    const path = join(tempDir, "noperm.json");
    await writeFile(path, "{}");
    await chmod(path, 0o000);

    const result = await createRequestBodyReader(pipedStdin("")).read(path);
    // Back to readable so the suite's rm of the temp dir cannot trip on it.
    await chmod(path, 0o644);

    assertErr(result);
    expect(result.error.message).toContain("EACCES");
  });

  it("rejects a directory", async () => {
    const result = await createRequestBodyReader(pipedStdin("")).read(tempDir);

    assertErr(result);
    expect(result.error.message).toContain("is a directory");
  });
});
