import { describe, expect, it } from "vitest";
import { DENIAL_PREFIX } from "../lib/policy.js";
import { renderRunReport, renderTaskReport } from "../lib/report/markdown.js";
import type { RunSummary } from "../lib/results.js";
import type { ToolCall } from "../lib/toolCalls.js";
import type { TaskTrace } from "../lib/transcript.js";
import type { Assertion } from "../lib/types.js";

const createBashCall = (
  index: number,
  command: string,
  outcome: ToolCall["outcome"],
  stdout = "",
  stderr = "",
): ToolCall => ({
  index,
  tool: "Bash",
  command,
  fetchPrompt: "",
  outcome,
  stdout,
  stderr,
  durationMs: null,
});

const okCall = createBashCall(0, "kontent content-type list", "ok", "Article\n");

const failedCall = createBashCall(
  1,
  "kontent content-type get --codename missing",
  "failed",
  "",
  "Content type not found\n",
);

const heredocFailedCall = createBashCall(
  1,
  'cat > body.json <<\'EOF\'\n{"name":"x"}\nEOF\nkontent mapi types --input body.json',
  "failed",
  "",
  "Error: HTTP 400 Bad Request\n",
);

const deniedCall = createBashCall(
  2,
  "cat /etc/passwd",
  "denied",
  "",
  `${DENIAL_PREFIX}outside workspace`,
);

const noResultCall = createBashCall(3, "kontent content-type list --format json", "no-result");

const fetchCall: ToolCall = {
  index: 4,
  tool: "WebFetch",
  command: "https://kontent.ai/learn/docs/apis/openapi/management-api-v2",
  fetchPrompt: "taxonomy term shape",
  outcome: "ok",
  stdout: "terms: [{ name, codename, terms }]",
  stderr: "",
  durationMs: 2400,
};

const trace: TaskTrace = {
  toolCalls: [okCall, failedCall, deniedCall, noResultCall, fetchCall],
  agentTexts: [
    { afterToolCallIndex: -1, text: "Let me look around first." },
    { afterToolCallIndex: 1, text: "Trying again." },
  ],
  finalReply: "Done.",
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
  invocations: [],
  cliInvocationCount: 2,
  failedCliInvocationCount: 1,
  helpLookupCount: 0,
  docsLookupCount: 0,
  webFetchCount: 1,
  deniedCallCount: 1,
};

const assertions: ReadonlyArray<Assertion> = [
  { id: "article-type-exists", passed: true, evidence: "content types: Article" },
  { id: "seo-snippet-exists", passed: false, evidence: "snippets: none" },
];

describe("renderTaskReport", () => {
  it("renders a failed task", async () => {
    const report = renderTaskReport("content-type-with-snippet", trace, "FAIL", assertions);

    await expect(report).toMatchFileSnapshot("./__snapshots__/taskReport.fail.md");
  });

  it("renders an errored task", async () => {
    const report = renderTaskReport("t", trace, "ERROR", [], "the check threw: boom");

    await expect(report).toMatchFileSnapshot("./__snapshots__/taskReport.error.md");
  });
});

describe("renderRunReport", () => {
  const summary: RunSummary = {
    header: {
      model: "opus",
      tools: ["Bash", "WebFetch"],
      permissionRules: ["Bash", "WebFetch(domain:kontent.ai)"],
      maxTurns: 40,
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
        toolCallCount: 2,
        cliInvocationCount: 2,
        failedCliInvocationCount: 1,
        deniedCallCount: 1,
        helpLookupCount: 0,
        docsLookupCount: 0,
        webFetchCount: 1,
        costUsd: 0.42,
        inputTokens: 12_000,
        outputTokens: 3000,
        durationMs: 90_000,
        stopReason: "completed",
      },
    ],
  };

  const traces = [
    {
      id: "content-type-with-snippet",
      trace: { ...trace, toolCalls: [...trace.toolCalls, heredocFailedCall] },
    },
  ];

  it("renders a run", async () => {
    const report = renderRunReport(summary, traces);

    await expect(report).toMatchFileSnapshot("./__snapshots__/runReport.md");
  });

  it("lists only the first line of a failed heredoc command", () => {
    const report = renderRunReport(summary, traces);

    expect(report).toContain("`cat > body.json <<'EOF'`  Error: HTTP 400 Bad Request");
    expect(report).not.toContain('{"name":"x"}');
  });

  it("omits the help lookup section when no task looked up help", () => {
    expect(renderRunReport(summary, traces)).not.toContain("Most help lookups");
  });
});
