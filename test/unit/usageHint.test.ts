import { describe, expect, it } from "vitest";
import yargs, { type Argv } from "yargs";
import { usageHint } from "../../src/cli/commands/shared/usageHint.js";

const noop = (): void => undefined;

// Same shape as the real CLI: a leaf with a positional, and a group with a subcommand.
const hintFor = async (argv: ReadonlyArray<string>): Promise<string | undefined> => {
  let hint: string | undefined;
  const parser: Argv = yargs([...argv])
    .command("mapi <endpoint>", "", (b) => b.positional("endpoint", { type: "string" }), noop)
    .command(
      "environment",
      "",
      (b) =>
        b
          .command("use <id>", "", (u) => u.positional("id", { type: "string" }), noop)
          .demandCommand(1),
      noop,
    )
    .demandCommand(1)
    .strict()
    .exitProcess(false)
    .fail((message: string | null, error: unknown) => {
      hint = usageHint(parser);
      throw error ?? new Error(message ?? "");
    });
  await Promise.resolve()
    .then(async () => parser.parseAsync())
    .catch(noop);
  return hint;
};

describe("usageHint", () => {
  it.each([
    { argv: [], expected: "Run `kontent --help` for usage." },
    { argv: ["nosuchcmd"], expected: "Run `kontent --help` for usage." },
    { argv: ["mapi", "types", "--bogus"], expected: "Run `kontent mapi --help` for usage." },
    { argv: ["mapi"], expected: "Run `kontent mapi --help` for usage." },
    {
      argv: ["environment", "use", "x", "--bogus"],
      expected: "Run `kontent environment use --help` for usage.",
    },
  ])("points $argv at its help", async ({ argv, expected }) => {
    expect(await hintFor(argv)).toBe(expected);
  });

  it.each([
    { name: "no internal methods", parser: {} },
    { name: "a renamed getContext", parser: { getInternalMethods: () => ({}) } },
    {
      name: "a context without commands",
      parser: { getInternalMethods: () => ({ getContext: () => ({}) }) },
    },
  ])("falls back to the root help with $name", ({ parser }) => {
    expect(usageHint(parser)).toBe("Run `kontent --help` for usage.");
  });
});
