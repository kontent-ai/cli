import { describe, expect, it } from "vitest";
import type { CommandRecord } from "../../evals/lib/commands.js";
import { renderRunReport, renderTaskReport } from "../../evals/lib/report/markdown.js";
import type { RunSummary } from "../../evals/lib/results.js";
import type { TaskTrace } from "../../evals/lib/transcript.js";
import type { Assertion } from "../../evals/lib/types.js";

const okCommand: CommandRecord = {
  index: 0,
  command: "kontent content-type list",
  outcome: "ok",
  exitCode: null,
  stdout: "Article\n",
  stderr: "",
  durationMs: null,
  isHelpLookup: false,
};

const failedCommand: CommandRecord = {
  index: 1,
  command: "kontent content-type get --codename missing",
  outcome: "failed",
  exitCode: null,
  stdout: "",
  stderr: "Content type not found\n",
  durationMs: null,
  isHelpLookup: false,
};

const deniedCommand: CommandRecord = {
  index: 2,
  command: "cat /etc/passwd",
  outcome: "denied",
  exitCode: null,
  stdout: "",
  stderr: "",
  durationMs: null,
  isHelpLookup: false,
};

const noResultCommand: CommandRecord = {
  index: 3,
  command: "kontent content-type list --format json",
  outcome: "no-result",
  exitCode: null,
  stdout: "",
  stderr: "",
  durationMs: null,
  isHelpLookup: false,
};

const trace: TaskTrace = {
  commands: [okCommand, failedCommand, deniedCommand, noResultCommand],
  agentTexts: [
    { afterCommandIndex: -1, text: "Let me look around first." },
    { afterCommandIndex: 1, text: "Trying again." },
  ],
  finalReply: "Done.",
  denials: [{ toolName: "Bash", command: "cat /etc/passwd", reason: "outside scratch" }],
  numbers: {
    turns: 2,
    durationMs: 90_000,
    costUsd: 0.42,
    inputTokens: 1000,
    outputTokens: 200,
    cacheReadTokens: 300,
    cacheCreationTokens: 50,
  },
  stopReason: "completed",
  helpLookupCount: 0,
  failedCommandCount: 1,
};

const assertions: ReadonlyArray<Assertion> = [
  { id: "article-type-exists", passed: true, evidence: "content types: Article" },
  { id: "seo-snippet-exists", passed: false, evidence: "snippets: none" },
];

describe("renderTaskReport", () => {
  it("includes the verdict heading, stats, assertions, commands and denials", () => {
    const report = renderTaskReport("content-type-with-snippet", trace, "FAIL", assertions);

    expect(report).toContain("# content-type-with-snippet: FAIL");
    expect(report).toContain("turns 2");
    expect(report).toContain("cost $0.42");
    expect(report).toContain("- PASS article-type-exists  content types: Article");
    expect(report).toContain("- FAIL seo-snippet-exists  snippets: none");
    expect(report).toContain("`kontent content-type list`");
    expect(report).toContain("Content type not found");
    expect(report).toContain('   > agent: "Trying again."');
    expect(report).toContain("- PreToolUse: `cat /etc/passwd` (outside scratch)");
    expect(report).toContain("## Agent final reply\nDone.");
  });

  it("labels commands ok, FAIL, DENIED and NORESULT by outcome", () => {
    const report = renderTaskReport("t", trace, "FAIL", assertions);

    expect(report).toContain("1. ok");
    expect(report).toContain("2. FAIL");
    expect(report).toContain("3. DENIED");
    expect(report).toContain("4. NORESULT");
  });

  it("renders agent text before the first command as a blockquote under ## Commands", () => {
    const report = renderTaskReport("t", trace, "FAIL", assertions);
    const commandsSection = report.split("## Commands")[1] ?? "";

    expect(commandsSection.trimStart().startsWith('> agent: "Let me look around first."')).toBe(
      true,
    );
  });

  it("omits an ## Error section when no error message is given", () => {
    const report = renderTaskReport("t", trace, "FAIL", assertions);

    expect(report).not.toContain("## Error");
  });

  it("renders an ## Error section with the message when given", () => {
    const report = renderTaskReport("t", trace, "ERROR", [], "the check threw: boom");

    expect(report).toContain("## Error");
    expect(report).toContain("the check threw: boom");
  });
});

describe("renderRunReport", () => {
  it("includes the summary table, totals and friction sections", () => {
    const summary: RunSummary = {
      header: {
        model: "opus",
        tools: ["Bash"],
        cliVersion: "0.9.2",
        gitSha: "abc1234",
        envId: "env-1",
        preambleHash: "deadbeef1234",
        startedAt: "2026-09-10T00:00:00.000Z",
        finishedAt: "2026-09-10T00:10:00.000Z",
      },
      rows: [
        {
          id: "content-type-with-snippet",
          verdict: "FAIL",
          turns: 2,
          commandCount: 2,
          failedCommandCount: 1,
          helpLookupCount: 0,
          costUsd: 0.42,
          durationMs: 90_000,
          stopReason: "completed",
        },
      ],
    };

    const report = renderRunReport(summary, [{ id: "content-type-with-snippet", trace }]);

    expect(report).toContain("# Eval run: opus @ env-1");
    expect(report).toContain("| content-type-with-snippet | FAIL | 2 | 2 | 1 | 0 | $0.42 |");
    expect(report).toContain("0/1 passed");
    expect(report).toContain("## Friction");
    expect(report).toContain("### Most failed commands");
    expect(report).toContain("`kontent content-type get`");
    expect(report).toContain("Content type not found");
    expect(report).toContain("### content-type-with-snippet");
    expect(report).toContain("Done.");
  });
});
