import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import yargs from "yargs";
import { register } from "../../src/commands/mapi/request.js";
import type { MapiRequestParams } from "../../src/core/mapi/request.js";
import { performRawMapiRequest } from "../../src/core/mapi/request.js";
import { ok } from "../../src/lib/result.js";
import { noopTelemetry } from "../../src/lib/telemetry/tracking.js";

vi.mock("../../src/core/mapi/request.js", () => ({
  performRawMapiRequest: vi.fn(async () =>
    ok({ statusCode: 200, statusText: "OK", headers: [], body: null }),
  ),
}));

vi.mock("../../src/lib/auth/tokenAccess.js", () => ({
  getValidAccessToken: vi.fn(async () => ok("stored-login-token")),
}));

const ENV_ID = "11111111-2222-3333-4444-555555555555";

// Drives the real yargs wiring, so what the parser hands the handler is what is
// asserted on. The core call is faked; everything above it is production code.
const runCommand = async (argv: ReadonlyArray<string>): Promise<string | undefined> => {
  const parser = register(
    yargs([...argv])
      .strict()
      .exitProcess(false)
      .fail(false),
    {
      telemetry: noopTelemetry,
    },
  );
  try {
    await parser.parseAsync([...argv]);
    return undefined;
  } catch (cause) {
    return cause instanceof Error ? cause.message : String(cause);
  }
};

const captureStream = (stream: "stdout" | "stderr") => {
  const chunks: string[] = [];
  const spy = vi.spyOn(process[stream], "write").mockImplementation((chunk) => {
    chunks.push(typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk));
    return true;
  });
  return {
    text: () => chunks.join(""),
    restore: () => spy.mockRestore(),
  };
};

const lastParams = (): MapiRequestParams =>
  vi.mocked(performRawMapiRequest).mock.calls.at(-1)?.[0] as MapiRequestParams;

describe("kontent mapi argument handling", () => {
  let tempDir: string;

  beforeAll(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "kontent-mapi-"));
  });

  afterAll(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    process.exitCode = undefined;
    vi.mocked(performRawMapiRequest).mockClear();
  });

  it("keeps -H from swallowing the endpoint positional", async () => {
    const failure = await runCommand(["-H", "X-Foo: 1", "types", "--envId", ENV_ID]);

    expect(failure).toBeUndefined();
    expect(lastParams().endpoint).toBe("types");
    expect(lastParams().headers).toContainEqual({ name: "X-Foo", value: "1" });
  });

  it("accepts -H after the endpoint too", async () => {
    const failure = await runCommand(["types", "-H", "X-Foo: 1", "--envId", ENV_ID]);

    expect(failure).toBeUndefined();
    expect(lastParams().endpoint).toBe("types");
  });

  it("collects a repeated -H into one header list", async () => {
    await runCommand(["-H", "X-Foo: 1", "-H", "X-Bar: 2", "types", "--envId", ENV_ID]);

    expect(lastParams().headers).toEqual([
      { name: "X-Foo", value: "1" },
      { name: "X-Bar", value: "2" },
    ]);
  });

  // presentResponse decides the wording; what matters here is that its two halves
  // reach different streams and that the command still fails.
  it("keeps a dropped-body warning off stdout", async () => {
    vi.mocked(performRawMapiRequest).mockResolvedValueOnce(
      ok({
        statusCode: 502,
        statusText: "Bad Gateway",
        headers: [
          { name: "Content-Type", value: "text/html; charset=utf-8" },
          { name: "Content-Length", value: "137" },
        ],
        body: null,
      }),
    );
    const stdout = captureStream("stdout");
    const stderr = captureStream("stderr");

    await runCommand(["types", "--envId", ENV_ID]);
    stdout.restore();
    stderr.restore();

    expect(stdout.text()).toBe("");
    expect(stderr.text()).toContain("137 bytes of text/html");
    expect(process.exitCode).toBe(1);
  });

  it("prints a 4xx body on stdout and its diagnosis on stderr", async () => {
    vi.mocked(performRawMapiRequest).mockResolvedValueOnce(
      ok({
        statusCode: 404,
        statusText: "Not Found",
        headers: [{ name: "content-type", value: "application/json" }],
        body: { message: "The requested content type was not found." },
      }),
    );
    const stdout = captureStream("stdout");
    const stderr = captureStream("stderr");

    await runCommand(["types/missing", "--envId", ENV_ID]);
    stdout.restore();
    stderr.restore();

    expect(stdout.text()).toContain("The requested content type was not found.");
    expect(stderr.text()).toContain("HTTP 404 Not Found");
    expect(stderr.text()).not.toContain("The requested content type was not found.");
    expect(process.exitCode).toBe(1);
  });

  it("sends the file at --input as the request body", async () => {
    const path = join(tempDir, "body.json");
    await writeFile(path, '{"name":"Article"}');

    await runCommand(["types", "--input", path, "--envId", ENV_ID]);

    const params = lastParams();
    expect(params.method).toBe("POST");
    expect(await params.body?.text()).toBe('{"name":"Article"}');
  });

  it("wires no abort of its own, leaving SIGINT to the telemetry handler", async () => {
    await runCommand(["types", "--envId", ENV_ID]);

    expect(lastParams().abortSignal).toBeUndefined();
  });

  it("reports an unreadable --input file without calling the API", async () => {
    // Inside the suite's temp dir, so "missing" is a fact rather than a guess about /tmp.
    const path = join(tempDir, "absent", "body.json");
    const captured = captureStream("stderr");

    await runCommand(["types", "--input", path, "--envId", ENV_ID]);
    captured.restore();

    expect(captured.text()).toContain(path);
    expect(process.exitCode).toBe(1);
    expect(performRawMapiRequest).not.toHaveBeenCalled();
  });

  it("rejects a body on GET instead of letting the transport throw", async () => {
    const captured = captureStream("stderr");

    await runCommand(["types", "-X", "GET", "--input", "body.json", "--envId", ENV_ID]);
    captured.restore();

    expect(captured.text()).toContain("A GET request cannot carry a body");
    expect(process.exitCode).toBe(1);
    expect(performRawMapiRequest).not.toHaveBeenCalled();
  });
});
