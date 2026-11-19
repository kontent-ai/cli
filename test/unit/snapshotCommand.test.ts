import { describe, expect, it } from "vitest";
import yargs from "yargs";
import { snapshotCommand } from "../../src/cli/commands/model/snapshot/snapshot.js";
import { addLogLevelOptions } from "../../src/cli/log.js";

const ENV_ID = "11111111-2222-3333-4444-555555555555";

type Parsed = Readonly<{ path?: string; envId?: string; mapiKey?: string }>;

// The real command definition with a handler that only records what yargs parsed.
const parse = async (
  argv: ReadonlyArray<string>,
): Promise<Readonly<{ parsed: Parsed | undefined; failure: string | undefined }>> => {
  let parsed: Parsed | undefined;
  try {
    await addLogLevelOptions(yargs([...argv]))
      .command({
        command: snapshotCommand.command,
        describe: snapshotCommand.describe,
        builder: (b) => snapshotCommand.builder(b),
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

describe("kontent model snapshot argument parsing", () => {
  it("defaults the folder to ./model-snapshot", async () => {
    const { parsed, failure } = await parse(["snapshot"]);

    expect(failure).toBeUndefined();
    expect(parsed?.path).toBe("./model-snapshot");
  });

  it("takes the folder, the environment and the key from the flags", async () => {
    const { parsed, failure } = await parse([
      "snapshot",
      "--path",
      "content-model",
      "--envId",
      ENV_ID,
      "--mapiKey",
      "secret",
    ]);

    expect(failure).toBeUndefined();
    expect(parsed).toMatchObject({ path: "content-model", envId: ENV_ID, mapiKey: "secret" });
  });

  it.each([
    { flag: "--path", message: "--path must not be empty." },
    { flag: "--envId", message: "--envId must not be empty." },
    { flag: "--mapiKey", message: "--mapiKey must not be empty." },
  ])("rejects an empty $flag", async ({ flag, message }) => {
    const { parsed, failure } = await parse(["snapshot", flag, " "]);

    expect(parsed).toBeUndefined();
    expect(failure).toBe(message);
  });

  it("rejects an unknown flag", async () => {
    const { parsed, failure } = await parse(["snapshot", "--include"]);

    expect(parsed).toBeUndefined();
    expect(failure).toContain("Unknown argument");
  });
});
