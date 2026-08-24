import { beforeEach, describe, expect, it, vi } from "vitest";
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

  // core-sdk drops a body it does not recognize as JSON, so the only honest thing
  // left to do is say on stderr that something was there.
  it("reports a non-JSON body on stderr instead of printing nothing at all", async () => {
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

  it("re-indents a JSON body", async () => {
    vi.mocked(performRawMapiRequest).mockResolvedValueOnce(
      ok({
        statusCode: 200,
        statusText: "OK",
        headers: [{ name: "content-type", value: "application/json" }],
        body: { name: "Article" },
      }),
    );
    const stdout = captureStream("stdout");

    await runCommand(["types", "--envId", ENV_ID]);
    stdout.restore();

    expect(stdout.text()).toBe('{\n  "name": "Article"\n}\n');
  });

  // Media types are case-insensitive (RFC 9110), and the API sends a charset
  // parameter, so neither may decide whether the body is treated as JSON.
  it("re-indents a JSON body whose media type is not lowercase", async () => {
    vi.mocked(performRawMapiRequest).mockResolvedValueOnce(
      ok({
        statusCode: 200,
        statusText: "OK",
        headers: [{ name: "Content-Type", value: "Application/JSON; charset=utf-8" }],
        body: { name: "Article" },
      }),
    );
    const stdout = captureStream("stdout");

    await runCommand(["types", "--envId", ENV_ID]);
    stdout.restore();

    expect(stdout.text()).toBe('{\n  "name": "Article"\n}\n');
  });

  // A 204 carries no content type, which is the same signal as a body that was
  // dropped - only the absent Content-Length separates the two.
  it("stays quiet when a success simply has no body", async () => {
    vi.mocked(performRawMapiRequest).mockResolvedValueOnce(
      ok({ statusCode: 204, statusText: "No Content", headers: [], body: null }),
    );
    const stdout = captureStream("stdout");
    const stderr = captureStream("stderr");

    await runCommand(["items/x", "-X", "DELETE", "--envId", ENV_ID]);
    stdout.restore();
    stderr.restore();

    expect(stdout.text()).toBe("");
    expect(stderr.text()).toBe("");
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
