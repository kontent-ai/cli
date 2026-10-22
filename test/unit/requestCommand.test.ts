import { describe, expect, it } from "vitest";
import yargs from "yargs";
import { requestCommand } from "../../src/cli/commands/mapi/request/request.js";
import { addLogLevelOptions } from "../../src/cli/log.js";

const ENV_ID = "11111111-2222-3333-4444-555555555555";

type Parsed = Readonly<{ endpoint?: string; header?: ReadonlyArray<string>; input?: string }>;

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

describe("kontent mapi argument parsing", () => {
  it("keeps -H from swallowing the endpoint positional", async () => {
    const { parsed, failure } = await parse(["-H", "X-Foo: 1", "types", "--envId", ENV_ID]);

    expect(failure).toBeUndefined();
    expect(parsed?.endpoint).toBe("types");
    expect(parsed?.header).toEqual(["X-Foo: 1"]);
  });

  it("collects a repeated -H into one header list", async () => {
    const { parsed } = await parse([
      "-H",
      "X-Foo: 1",
      "-H",
      "X-Bar: 2",
      "types",
      "--envId",
      ENV_ID,
    ]);

    expect(parsed?.header).toEqual(["X-Foo: 1", "X-Bar: 2"]);
  });

  // Without nargs on --input, strict mode rejects the lone "-" as an unknown positional.
  it("accepts --input - for stdin", async () => {
    const { parsed, failure } = await parse(["types", "--input", "-", "--envId", ENV_ID]);

    expect(failure).toBeUndefined();
    expect(parsed?.input).toBe("-");
  });

  it("rejects a blank --envId", async () => {
    const { parsed, failure } = await parse(["types", "--envId", ""]);

    expect(failure).toContain("--envId must not be empty.");
    expect(parsed).toBeUndefined();
  });
});
