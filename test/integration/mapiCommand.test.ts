import { beforeEach, describe, expect, it, vi } from "vitest";
import yargs from "yargs";
import { register } from "../../src/commands/mapi/request.js";
import type { MapiRequestParams } from "../../src/core/mapi/request.js";
import { performRawMapiRequest } from "../../src/core/mapi/request.js";
import { ok } from "../../src/lib/result.js";
import { noopTelemetry } from "../../src/lib/telemetry/tracking.js";

vi.mock("../../src/core/mapi/request.js", () => ({
  performRawMapiRequest: vi.fn(async () =>
    ok({ statusCode: 200, statusText: "OK", headers: [], body: new Uint8Array() }),
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

// Chunks are kept as bytes, not text: a body that is not valid UTF-8 must survive
// the capture unchanged, or a passthrough test cannot tell mangling from fidelity.
const captureStream = (stream: "stdout" | "stderr") => {
  const chunks: Uint8Array[] = [];
  const spy = vi.spyOn(process[stream], "write").mockImplementation((chunk) => {
    chunks.push(typeof chunk === "string" ? encode(chunk) : chunk);
    return true;
  });
  return {
    text: () => new TextDecoder().decode(Buffer.concat(chunks)),
    bytes: () => Buffer.concat(chunks),
    restore: () => spy.mockRestore(),
  };
};

const encode = (text: string): Uint8Array => new TextEncoder().encode(text);

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

  it("prints a non-JSON body verbatim rather than dropping it", async () => {
    vi.mocked(performRawMapiRequest).mockResolvedValueOnce(
      ok({
        statusCode: 200,
        statusText: "OK",
        headers: [{ name: "Content-Type", value: "text/csv; charset=utf-8" }],
        body: encode("a,b\n1,2\n"),
      }),
    );
    const stdout = captureStream("stdout");
    const stderr = captureStream("stderr");

    await runCommand(["export", "--envId", ENV_ID]);
    stdout.restore();
    stderr.restore();

    expect(stdout.text()).toBe("a,b\n1,2\n");
    expect(stderr.text()).toBe("");
    expect(process.exitCode).toBeUndefined();
  });

  it("re-indents a JSON body", async () => {
    vi.mocked(performRawMapiRequest).mockResolvedValueOnce(
      ok({
        statusCode: 200,
        statusText: "OK",
        headers: [{ name: "content-type", value: "application/json" }],
        body: encode('{"name":"Article"}'),
      }),
    );
    const stdout = captureStream("stdout");

    await runCommand(["types", "--envId", ENV_ID]);
    stdout.restore();

    expect(stdout.text()).toBe('{\n  "name": "Article"\n}\n');
  });

  // A body that claims JSON but does not parse is a clue, so it survives unchanged.
  it("prints a malformed JSON body as it arrived", async () => {
    vi.mocked(performRawMapiRequest).mockResolvedValueOnce(
      ok({
        statusCode: 200,
        statusText: "OK",
        headers: [{ name: "content-type", value: "application/json" }],
        body: encode("{not json"),
      }),
    );
    const stdout = captureStream("stdout");

    await runCommand(["types", "--envId", ENV_ID]);
    stdout.restore();

    expect(stdout.text()).toBe("{not json");
  });

  // Media types are case-insensitive (RFC 9110), and the API sends a charset
  // parameter, so neither may decide whether the body is treated as JSON.
  it("re-indents a JSON body whose media type is not lowercase", async () => {
    vi.mocked(performRawMapiRequest).mockResolvedValueOnce(
      ok({
        statusCode: 200,
        statusText: "OK",
        headers: [{ name: "Content-Type", value: "Application/JSON; charset=utf-8" }],
        body: encode('{"name":"Article"}'),
      }),
    );
    const stdout = captureStream("stdout");

    await runCommand(["types", "--envId", ENV_ID]);
    stdout.restore();

    expect(stdout.text()).toBe('{\n  "name": "Article"\n}\n');
  });

  // The reason the body is carried as bytes: a string round-trip would replace
  // every byte that is not valid UTF-8 with U+FFFD and corrupt the download.
  it("passes a binary body through byte for byte", async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff, 0xfe, 0x00]);
    vi.mocked(performRawMapiRequest).mockResolvedValueOnce(
      ok({
        statusCode: 200,
        statusText: "OK",
        headers: [{ name: "content-type", value: "image/png" }],
        body: png,
      }),
    );
    const stdout = captureStream("stdout");

    await runCommand(["assets/x", "--envId", ENV_ID]);
    stdout.restore();

    expect(Buffer.compare(stdout.bytes(), Buffer.from(png))).toBe(0);
  });

  it("stays quiet when a success simply has no body", async () => {
    vi.mocked(performRawMapiRequest).mockResolvedValueOnce(
      ok({ statusCode: 204, statusText: "No Content", headers: [], body: encode("") }),
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
