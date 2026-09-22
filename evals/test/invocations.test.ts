import { describe, expect, it } from "vitest";
import { countInvocations, parseInvocationLog } from "../lib/invocations.js";

const record = (exitCode: number, args: ReadonlyArray<string>): string =>
  `${JSON.stringify({ exitCode, args })}\n`;

describe("parseInvocationLog", () => {
  it("parses one invocation per JSON line", () => {
    const log =
      record(0, ["docs", "search", "content type"]) +
      record(1, ["mapi", "types", "--envId", "x", "--mapiKey", "<mapi-key>"]);

    expect(parseInvocationLog(log)).toEqual([
      { exitCode: 0, args: ["docs", "search", "content type"] },
      { exitCode: 1, args: ["mapi", "types", "--envId", "x", "--mapiKey", "<mapi-key>"] },
    ]);
  });

  it("skips a line that is not valid JSON", () => {
    const log = `${record(0, ["docs"])}not json\n`;

    expect(parseInvocationLog(log)).toEqual([{ exitCode: 0, args: ["docs"] }]);
  });

  it("skips a line whose exitCode is not a finite integer", () => {
    const log = `${record(0, ["docs"])}${JSON.stringify({ exitCode: "abc", args: ["docs"] })}\n`;

    expect(parseInvocationLog(log)).toEqual([{ exitCode: 0, args: ["docs"] }]);
  });
});

describe("countInvocations", () => {
  it("counts invocations, failures, help and docs lookups", () => {
    const log =
      record(0, ["docs", "search", "content type"]) +
      record(1, ["mapi", "types", "--envId", "x", "--mapiKey", "<mapi-key>"]);

    expect(countInvocations(parseInvocationLog(log))).toEqual({
      cliInvocationCount: 2,
      failedCliInvocationCount: 1,
      helpLookupCount: 0,
      docsLookupCount: 1,
    });
  });

  it("counts a `kontent docs --help` invocation as both a docs and a help lookup", () => {
    const log = record(0, ["docs", "--help"]);

    expect(countInvocations(parseInvocationLog(log))).toEqual({
      cliInvocationCount: 1,
      failedCliInvocationCount: 0,
      helpLookupCount: 1,
      docsLookupCount: 1,
    });
  });
});
