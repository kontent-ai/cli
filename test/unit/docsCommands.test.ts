import { describe, expect, it } from "vitest";
import yargs, { type Argv } from "yargs";
import { endpointCommand } from "../../src/cli/commands/docs/endpoint/endpoint.js";
import { objectCommand } from "../../src/cli/commands/docs/object/object.js";
import { searchCommand } from "../../src/cli/commands/docs/search/search.js";
import { addLogLevelOptions, type LogOptions } from "../../src/cli/log.js";

type Definition = Readonly<{
  command: string;
  describe: string;
  builder: <T extends LogOptions>(b: Argv<T>) => Argv<unknown>;
}>;

type Parsed = Readonly<{ query?: string; limit?: number; api?: string }>;

// The real command definition with a handler that only records what yargs parsed.
const parse = async (definition: Definition, argv: ReadonlyArray<string>) => {
  let parsed: Parsed | undefined;
  try {
    await addLogLevelOptions(yargs([...argv]))
      .command({
        command: definition.command,
        describe: definition.describe,
        builder: (b) => definition.builder(b),
        handler: (args) => {
          parsed = args as Parsed;
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

describe("kontent docs argument parsing", () => {
  it("passes the search positional and the limit", async () => {
    const { parsed, failure } = await parse(searchCommand, [
      "search",
      "how to filter by taxonomy",
      "--limit",
      "3",
    ]);

    expect(failure).toBeUndefined();
    expect(parsed).toMatchObject({ query: "how to filter by taxonomy", limit: 3 });
  });

  it("leaves search unfiltered by default and filters on --api", async () => {
    const unfiltered = await parse(searchCommand, ["search", "webhook"]);
    const filtered = await parse(searchCommand, ["search", "webhook", "--api", "delivery_api"]);

    expect(unfiltered.parsed?.api).toBeUndefined();
    expect(filtered.parsed?.api).toBe("delivery_api");
  });

  it("requires --api on object and endpoint lookups", async () => {
    const object = await parse(objectCommand, ["object", "text element"]);
    const endpoint = await parse(endpointCommand, ["endpoint", "add a content type"]);

    expect(object.failure).toContain("Missing required argument: api");
    expect(endpoint.failure).toContain("Missing required argument: api");
  });

  it("rejects an api the service does not know", async () => {
    const { parsed, failure } = await parse(objectCommand, [
      "object",
      "text element",
      "--api",
      "nope",
    ]);

    expect(failure).toContain("Invalid values");
    expect(parsed).toBeUndefined();
  });

  it.each(["0", "11", "1.5"])("rejects --limit %s", async (limit) => {
    const { failure } = await parse(searchCommand, ["search", "taxonomy", "--limit", limit]);

    expect(failure).toContain("--limit must be a whole number between 1 and 10.");
  });

  it("shares the limit check with the detail commands", async () => {
    const { failure } = await parse(endpointCommand, [
      "endpoint",
      "add a content type",
      "--api",
      "content_management_api_v2",
      "--limit",
      "0",
    ]);

    expect(failure).toContain("--limit must be a whole number between 1 and 10.");
  });
});
