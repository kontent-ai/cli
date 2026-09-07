import { beforeEach, describe, expect, it, vi } from "vitest";
import yargs from "yargs";
import { register } from "../../src/commands/docs/docs.js";
import { searchDocs } from "../../src/core/docs/learn.js";
import { err, ok } from "../../src/lib/result.js";
import { noopTelemetry } from "../../src/lib/telemetry/tracking.js";

vi.mock("../../src/core/docs/learn.js", () => ({
  searchDocs: vi.fn(async () => ok([{ title: "Filter by taxonomy" }])),
  getEndpointDetails: vi.fn(async () => ok({ title: "Upsert a language variant" })),
  getObjectDetails: vi.fn(async () => ok({ title: "Language variant" })),
}));

// Drives the real yargs wiring, so what the parser hands the handler is what is
// asserted on. The core call is faked; everything above it is production code.
const runCommand = async (argv: ReadonlyArray<string>): Promise<string | undefined> => {
  const parser = register(
    yargs([...argv])
      .strict()
      .exitProcess(false)
      .fail(false),
    { telemetry: noopTelemetry },
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

const lastSearchParams = () => vi.mocked(searchDocs).mock.calls.at(-1)?.[0];

describe("kontent docs argument handling", () => {
  beforeEach(() => {
    process.exitCode = undefined;
    vi.mocked(searchDocs).mockClear();
  });

  it("passes the search positional and the limit to the core", async () => {
    const captured = captureStream("stdout");
    const failure = await runCommand([
      "docs",
      "search",
      "how to filter by taxonomy",
      "--limit",
      "3",
    ]);
    captured.restore();

    expect(failure).toBeUndefined();
    expect(lastSearchParams()).toEqual({ query: "how to filter by taxonomy", limit: 3 });
  });

  it.each(["0", "11", "1.5"])("rejects --limit %s without calling the core", async (limit) => {
    const failure = await runCommand(["docs", "search", "taxonomy", "--limit", limit]);

    expect(failure).toContain("--limit must be a whole number between 1 and 10.");
    expect(searchDocs).not.toHaveBeenCalled();
  });

  it("prints the payload as indented JSON on stdout and says nothing on stderr", async () => {
    const stdout = captureStream("stdout");
    const stderr = captureStream("stderr");

    await runCommand(["docs", "object", "language variant"]);
    stdout.restore();
    stderr.restore();

    expect(stdout.text()).toBe(`{\n  "title": "Language variant"\n}\n`);
    expect(stderr.text()).toBe("");
    expect(process.exitCode).toBeUndefined();
  });

  it("keeps a failed request off stdout and fails the command", async () => {
    vi.mocked(searchDocs).mockResolvedValueOnce(
      err({ kind: "request-failed", message: "The Learn service is unreachable." }),
    );
    const stdout = captureStream("stdout");
    const stderr = captureStream("stderr");

    await runCommand(["docs", "search", "taxonomy"]);
    stdout.restore();
    stderr.restore();

    expect(stdout.text()).toBe("");
    expect(stderr.text()).toContain("The Learn service is unreachable.");
    expect(process.exitCode).toBe(1);
  });
});
