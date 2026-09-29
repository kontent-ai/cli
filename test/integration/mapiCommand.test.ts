import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import yargs from "yargs";
import { register as registerMapiCommand } from "../../src/commands/mapi/request.js";
import type { MapiRequestParams } from "../../src/core/mapi/request.js";
import { performRawMapiRequest } from "../../src/core/mapi/request.js";
import { getValidAccessToken } from "../../src/lib/auth/tokenAccess.js";
import { err, ok } from "../../src/lib/result.js";
import type { Telemetry } from "../../src/lib/telemetry/tracking.js";

vi.mock("../../src/core/mapi/request.js", () => ({
  performRawMapiRequest: vi.fn(async () =>
    ok({ statusCode: 200, statusText: "OK", headers: [], body: null }),
  ),
}));

vi.mock("../../src/lib/auth/tokenAccess.js", () => ({
  getValidAccessToken: vi.fn(async () => ok("stored-login-token")),
}));

const ENV_ID = "11111111-2222-3333-4444-555555555555";
const STORED_ENV_ID = "99999999-8888-7777-6666-555555555555";

const trackFailure = vi.fn();
const telemetry: Telemetry = {
  startCommandTracking: () => ({ succeed: () => {}, fail: trackFailure }),
  flush: async () => {},
};

type CommandRun = Readonly<{ failure: string | undefined; stdout: string; stderr: string }>;

// Drives the real yargs wiring, so what the parser hands the handler is what is
// asserted on. The core call is faked; everything above it is production code.
// Both streams are always captured: every 2xx writes somewhere, and a test that
// only cares about the parsed arguments must not spill that into the runner's output.
const runCommand = async (argv: ReadonlyArray<string>): Promise<CommandRun> => {
  const parser = registerMapiCommand(
    yargs([...argv])
      .strict()
      .exitProcess(false)
      .fail(false),
    {
      telemetry,
    },
  );
  const stdout = captureStream("stdout");
  const stderr = captureStream("stderr");
  try {
    await parser.parseAsync([...argv]);
    return { failure: undefined, stdout: stdout.text(), stderr: stderr.text() };
  } catch (cause) {
    const failure = cause instanceof Error ? cause.message : String(cause);
    return { failure, stdout: stdout.text(), stderr: stderr.text() };
  } finally {
    stdout.restore();
    stderr.restore();
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
  let configHome: string;

  // A real config file under a temp XDG_CONFIG_HOME rather than a mocked reader, so the
  // developer's own config never leaks in and a stored value still goes through parsing.
  const storeConfig = async (config: Readonly<Record<string, unknown>>): Promise<void> => {
    const dir = join(configHome, "kontent", "cli");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "config.json"), JSON.stringify(config));
  };

  beforeAll(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "kontent-mapi-"));
    configHome = join(tempDir, "config");
  });

  afterAll(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    process.exitCode = undefined;
    vi.mocked(performRawMapiRequest).mockClear();
    trackFailure.mockClear();
    vi.unstubAllEnvs();
    vi.stubEnv("XDG_CONFIG_HOME", configHome);
    await rm(configHome, { recursive: true, force: true });
  });

  it("keeps -H from swallowing the endpoint positional", async () => {
    const { failure } = await runCommand(["-H", "X-Foo: 1", "types", "--envId", ENV_ID]);

    expect(failure).toBeUndefined();
    expect(lastParams().endpoint).toBe("types");
    expect(lastParams().headers).toContainEqual({ name: "X-Foo", value: "1" });
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
    const { stdout, stderr } = await runCommand(["types", "--envId", ENV_ID]);

    expect(stdout).toBe("");
    expect(stderr).toContain("137 bytes of text/html");
    expect(process.exitCode).toBe(1);
  });

  it("announces an empty success body on stderr instead of leaving stdout silent", async () => {
    vi.mocked(performRawMapiRequest).mockResolvedValueOnce(
      ok({ statusCode: 204, statusText: "No Content", headers: [], body: null }),
    );
    const { stdout, stderr } = await runCommand([
      "items/<item-id>/publish",
      "-X",
      "PUT",
      "--envId",
      ENV_ID,
    ]);

    expect(stdout).toBe("");
    expect(stderr).toContain("HTTP 204 No Content");
    expect(process.exitCode).toBeUndefined();
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
    const { stdout, stderr } = await runCommand(["types/missing", "--envId", ENV_ID]);

    expect(stdout).toContain("The requested content type was not found.");
    expect(stderr).toContain("HTTP 404 Not Found");
    expect(stderr).not.toContain("The requested content type was not found.");
    expect(process.exitCode).toBe(1);
  });

  it("reports a transport failure on stderr and fails", async () => {
    vi.mocked(performRawMapiRequest).mockResolvedValueOnce(
      err({ kind: "transport", message: "fetch failed: getaddrinfo ENOTFOUND" }),
    );
    const { stdout, stderr } = await runCommand(["types", "--envId", ENV_ID]);

    expect(stdout).toBe("");
    expect(stderr).toContain("fetch failed: getaddrinfo ENOTFOUND");
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

  it.skipIf(process.platform === "win32")("drains a pipe at --input", async () => {
    const path = join(tempDir, "body.pipe");
    await promisify(execFile)("mkfifo", [path]);

    // The writer's open blocks until the command opens the read end, so both run at once.
    await Promise.all([
      writeFile(path, '{"name":"Article"}'),
      runCommand(["types", "--input", path, "--envId", ENV_ID]),
    ]);

    expect(lastParams().method).toBe("POST");
    expect(await lastParams().body?.text()).toBe('{"name":"Article"}');
  });

  // Without nargs on --input, strict mode rejects the lone "-" as an unknown positional.
  it("reads --input - from stdin, refusing when nothing is piped", async () => {
    // The runner's stdin is not a terminal, so the flag is set by hand and removed after.
    Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });
    const { failure, stderr } = await runCommand([
      "types",
      "--input",
      "-",
      "--envId",
      ENV_ID,
    ]).finally(() => {
      delete (process.stdin as { isTTY?: boolean }).isTTY;
    });

    expect(failure).toBeUndefined();
    expect(stderr).toContain("Nothing is piped to stdin");
    expect(process.exitCode).toBe(1);
    expect(performRawMapiRequest).not.toHaveBeenCalled();
  });

  it("reports an unreadable --input file without calling the API", async () => {
    // Inside the suite's temp dir, so "missing" is a fact rather than a guess about /tmp.
    const path = join(tempDir, "absent", "body.json");
    const { stderr } = await runCommand(["types", "--input", path, "--envId", ENV_ID]);

    expect(stderr).toContain(path);
    expect(stderr).toContain("ENOENT");
    expect(process.exitCode).toBe(1);
    expect(performRawMapiRequest).not.toHaveBeenCalled();
  });

  // Root ignores the mode bits, so the file would open either way.
  it.skipIf(process.getuid?.() === 0)(
    "rejects an unreadable --input file before the request goes out",
    async () => {
      const path = join(tempDir, "noperm.json");
      await writeFile(path, "{}");
      await chmod(path, 0o000);
      const { stderr } = await runCommand(["types", "--input", path, "--envId", ENV_ID]);
      // Back to readable so the suite's rm of the temp dir cannot trip on it.
      await chmod(path, 0o644);

      expect(stderr).toContain("EACCES");
      expect(process.exitCode).toBe(1);
      expect(performRawMapiRequest).not.toHaveBeenCalled();
    },
  );

  it("rejects a directory at --input before the request goes out", async () => {
    const { stderr } = await runCommand(["types", "--input", tempDir, "--envId", ENV_ID]);

    expect(stderr).toContain("is a directory");
    expect(process.exitCode).toBe(1);
    expect(performRawMapiRequest).not.toHaveBeenCalled();
  });

  it("rejects a body on GET instead of letting the transport throw", async () => {
    const { stderr } = await runCommand([
      "types",
      "-X",
      "GET",
      "--input",
      "body.json",
      "--envId",
      ENV_ID,
    ]);

    expect(stderr).toContain("A GET request cannot carry a body");
    expect(process.exitCode).toBe(1);
    expect(performRawMapiRequest).not.toHaveBeenCalled();
  });

  it("explains where a credential can come from when none is found", async () => {
    vi.mocked(getValidAccessToken).mockResolvedValueOnce(err({ kind: "not-logged-in" }));
    vi.stubEnv("KONTENT_MAPI_KEY", "");
    const { stderr } = await runCommand(["types", "--envId", ENV_ID]);

    expect(stderr).toContain(
      "No Management API credential found. Run `kontent login`, or pass --mapiKey <key>, send an Authorization header, or set KONTENT_MAPI_KEY.",
    );
    expect(process.exitCode).toBe(1);
    expect(performRawMapiRequest).not.toHaveBeenCalled();
  });

  it("rejects a blank --envId before any request goes out", async () => {
    const { failure } = await runCommand(["types", "--envId", ""]);

    expect(failure).toContain("--envId must not be empty.");
    expect(performRawMapiRequest).not.toHaveBeenCalled();
  });

  it("prefers --envId over the stored environment", async () => {
    await storeConfig({ envId: STORED_ENV_ID });
    const { stderr } = await runCommand(["types", "--envId", ENV_ID]);

    expect(lastParams().envId).toBe(ENV_ID);
    expect(stderr).not.toContain(STORED_ENV_ID);
  });

  it("falls back to the stored environment and says so on stderr", async () => {
    await storeConfig({ envId: STORED_ENV_ID });
    const { stdout, stderr } = await runCommand(["types"]);

    expect(lastParams().envId).toBe(STORED_ENV_ID);
    expect(stderr).toContain(`Using the stored default environment ${STORED_ENV_ID}.`);
    expect(stdout).not.toContain(STORED_ENV_ID);
  });

  it("fails with missing-env-id when neither --envId nor a stored environment is present", async () => {
    const { failure, stderr } = await runCommand(["types"]);

    expect(failure).toBeUndefined();
    expect(stderr).toContain("--envId <id>");
    expect(stderr).toContain("kontent environment use <id>");
    expect(trackFailure).toHaveBeenCalledWith("missing-env-id");
    expect(process.exitCode).toBe(1);
    expect(performRawMapiRequest).not.toHaveBeenCalled();
  });

  it("treats a stored value that is not a GUID as unset", async () => {
    await storeConfig({ envId: "../projects/other" });
    const { stderr } = await runCommand(["types"]);

    expect(trackFailure).toHaveBeenCalledWith("missing-env-id");
    expect(stderr).not.toContain("Using the stored default environment");
    expect(process.exitCode).toBe(1);
    expect(performRawMapiRequest).not.toHaveBeenCalled();
  });

  it("points at the stored environment on 403", async () => {
    await storeConfig({ envId: STORED_ENV_ID });
    vi.mocked(performRawMapiRequest).mockResolvedValueOnce(
      ok({ statusCode: 403, statusText: "Forbidden", headers: [], body: null }),
    );
    const { stderr } = await runCommand(["types"]);

    expect(stderr).toContain(
      `Used the stored default environment ${STORED_ENV_ID}. If that's the wrong one, change it with \`kontent environment use <id>\`, or pass --envId <id> for this call only.`,
    );
    expect(process.exitCode).toBe(1);
  });

  it("leaves the stored environment out of a 401 and points at the credential", async () => {
    vi.stubEnv("KONTENT_MAPI_KEY", "");
    await storeConfig({ envId: STORED_ENV_ID });
    vi.mocked(performRawMapiRequest).mockResolvedValueOnce(
      ok({ statusCode: 401, statusText: "Unauthorized", headers: [], body: null }),
    );
    const { stderr } = await runCommand(["types"]);

    expect(stderr).toContain("Run `kontent login` to sign in again.");
    expect(stderr).not.toContain("Used the stored default environment");
    expect(process.exitCode).toBe(1);
  });

  it("leaves the stored-environment hint out when --envId was passed", async () => {
    await storeConfig({ envId: STORED_ENV_ID });
    vi.mocked(performRawMapiRequest).mockResolvedValueOnce(
      ok({ statusCode: 403, statusText: "Forbidden", headers: [], body: null }),
    );
    const { stderr } = await runCommand(["types", "--envId", ENV_ID]);

    expect(stderr).toContain("HTTP 403 Forbidden");
    expect(stderr).not.toContain("Used the stored default environment");
    expect(process.exitCode).toBe(1);
  });
});
