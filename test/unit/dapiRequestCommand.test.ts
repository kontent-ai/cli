import { describe, expect, it } from "vitest";
import yargs from "yargs";
import { requestCommand } from "../../src/cli/commands/dapi/request/request.js";
import { addLogLevelOptions } from "../../src/cli/log.js";

type Parsed = Readonly<{ endpoint?: string; header?: ReadonlyArray<string>; maxPages?: number }>;

// The real command definition with a handler that only records what yargs parsed.
const parse = async (
  argv: ReadonlyArray<string>,
): Promise<Readonly<{ parsed: Parsed | undefined; failure: string | undefined }>> => {
  let parsed: Parsed | undefined;
  try {
    await addLogLevelOptions(yargs([...argv]))
      .command({
        command: requestCommand.command,
        describe: requestCommand.describe,
        builder: (b) => requestCommand.builder(b),
        handler: (args) => {
          parsed = args;
        },
      })
      .strict()
      .exitProcess(false)
      .fail(false)
      .parseAsync();
    return { parsed, failure: undefined };
  } catch (cause) {
    return { parsed, failure: cause instanceof Error ? cause.message : String(cause) };
  }
};

describe("kontent dapi argument parsing", () => {
  it("keeps -H from swallowing the endpoint positional", async () => {
    const { parsed, failure } = await parse(["-H", "X-Foo: 1", "items"]);

    expect(failure).toBeUndefined();
    expect(parsed?.endpoint).toBe("items");
    expect(parsed?.header).toEqual(["X-Foo: 1"]);
  });

  it("accepts --maxPages with --paginate", async () => {
    const { parsed, failure } = await parse(["items-feed", "--paginate", "--maxPages", "3"]);

    expect(failure).toBeUndefined();
    expect(parsed?.maxPages).toBe(3);
  });

  it.each([
    { argv: ["items", "--maxPages", "3"], message: "--maxPages requires --paginate." },
    {
      argv: ["items", "--paginate", "--maxPages", "0"],
      message: "--maxPages must be a whole number of at least 1.",
    },
    {
      argv: ["items", "--paginate", "-i"],
      message: "--include cannot be combined with --paginate",
    },
    { argv: ["items", "--envId", ""], message: "--envId must not be empty." },
    { argv: ["items", "--dapiKey", " "], message: "--dapiKey must not be empty." },
    { argv: ["items", "--slurp"], message: "--slurp requires --paginate." },
    { argv: ["items", "-X", "POST"], message: "Unknown argument" },
  ])("rejects $argv", async ({ argv, message }) => {
    const { parsed, failure } = await parse(argv);

    expect(failure).toContain(message);
    expect(parsed).toBeUndefined();
  });
});
