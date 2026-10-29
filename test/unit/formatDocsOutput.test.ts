import { describe, expect, it } from "vitest";
import { formatDocsOutput } from "../../src/cli/commands/docs/formatOutput.js";
import { err, ok } from "../../src/core/lib/result.js";

describe("formatDocsOutput", () => {
  // A single candidate is still a candidate list, so the shape does not change with --limit.
  it("prints the candidates as a JSON array and nothing else", () => {
    expect(formatDocsOutput(ok([{ title: "Language variant" }]), false)).toEqual({
      stdout: `[\n  {\n    "title": "Language variant"\n  }\n]\n`,
      error: undefined,
      isFailure: false,
      telemetry: { outcome: "succeed" },
    });
  });

  // Live payloads bury httpMethod after huge bodyParameters trees.
  it("prints httpMethod first even when the payload puts it later", () => {
    const output = formatDocsOutput(
      ok([
        {
          bodyParameters: { huge: "tree" },
          title: "Publish a language variant",
          httpMethod: "put",
        },
      ]),
      false,
    );

    expect(output.stdout.startsWith('[\n  {\n    "httpMethod"')).toBe(true);
  });

  it("prints the JSON on one line with --compact", () => {
    const output = formatDocsOutput(ok([{ title: "Language variant" }]), true);

    expect(output.stdout).toBe(`${JSON.stringify([{ title: "Language variant" }])}\n`);
  });

  it("keeps a failed request off stdout and fails the command", () => {
    const output = formatDocsOutput(
      err({ kind: "request-failed", message: "The Learn service is unreachable." }),
      false,
    );

    expect(output).toEqual({
      stdout: "",
      error: "The Learn service is unreachable.",
      isFailure: true,
      telemetry: { outcome: "fail", errorCode: "request-failed" },
    });
  });
});
