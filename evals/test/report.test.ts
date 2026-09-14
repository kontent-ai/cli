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
  it("includes the verdict heading, stats, assertions, tool calls and denials", () => {
    const report = renderTaskReport("content-type-with-snippet", trace, "FAIL", assertions);

    expect(report).toContain("# content-type-with-snippet: FAIL");
    expect(report).toContain("turns 2");
    expect(report).toContain("failed 1 | denied 1");
    expect(report).toContain("cost $0.42");
    expect(report).toContain("tokens in 1000 | out 200 | cache 350");
    expect(report).toContain("- PASS article-type-exists  content types: Article");
    expect(report).toContain("- FAIL seo-snippet-exists  snippets: none");
    expect(report).toContain("`kontent content-type list`");
    expect(report).toContain("Content type not found");
    expect(report).toContain('   > agent: "Trying again."');
    expect(report).toContain("## Agent final reply\nDone.");
  });

  it("lists a denied call under ## Denied", () => {
    const report = renderTaskReport("t", trace, "FAIL", assertions);
    const deniedSection = report.split("## Denied")[1] ?? "";

    expect(deniedSection).toContain(
      `- Bash \`cat /etc/passwd\` (${DENIAL_PREFIX}outside workspace)`,
    );
  });

  it("renders a WebFetch call with its url, prompt and timing", () => {
    const report = renderTaskReport("t", trace, "FAIL", assertions);

    expect(report).toContain(
      '5. ok         2.4s  WebFetch https://kontent.ai/learn/docs/apis/openapi/management-api-v2 ("taxonomy term shape")',
    );
    expect(report).toContain("docs 0 | fetch 1");
  });

  it("labels calls ok, FAIL, DENIED and NORESULT by outcome", () => {
    const report = renderTaskReport("t", trace, "FAIL", assertions);

    expect(report).toContain("1. ok");
    expect(report).toContain("2. FAIL");
    expect(report).toContain("3. DENIED");
    expect(report).toContain("4. NORESULT");
  });

  it("renders agent text before the first call as a blockquote under ## Tool calls", () => {
    const report = renderTaskReport("t", trace, "FAIL", assertions);
    const toolCallsSection = report.split("## Tool calls")[1] ?? "";

    expect(toolCallsSection.trimStart().startsWith('> agent: "Let me look around first."')).toBe(
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

    const report = renderRunReport(summary, [
      {
        id: "content-type-with-snippet",
        trace: { ...trace, toolCalls: [...trace.toolCalls, heredocFailedCall] },
      },
    ]);

    expect(report).toContain("# Eval run: opus @ env-1");
    expect(report).toContain("rules Bash, WebFetch(domain:kontent.ai)");
    expect(report).toContain("max turns 40");
    expect(report).toContain(
      "| task | verdict | turns | calls | cli | failed | denied | help | docs | fetch | cost | in | out | time |",
    );
    expect(report).toContain(
      "| content-type-with-snippet | FAIL | 2 | 2 | 2 | 1 | 1 | 0 | 0 | 1 | $0.42 | 12k | 3k |",
    );
    expect(report).toContain("### Web fetches");
    expect(report).toContain(
      '- content-type-with-snippet: ok WebFetch https://kontent.ai/learn/docs/apis/openapi/management-api-v2 ("taxonomy term shape")',
    );
    expect(report).toContain("0/1 passed");
    expect(report).toContain("## Friction");
    expect(report).toContain("### Failed calls");
    expect(report).toContain("`kontent content-type get --codename missing`");
    expect(report).toContain("Content type not found");
    expect(report).toContain("`cat > body.json <<'EOF'`  Error: HTTP 400 Bad Request");
    expect(report).not.toContain('{"name":"x"}');
    expect(report).toContain("### content-type-with-snippet");
    expect(report).toContain("Done.");
    expect(report).not.toContain("Most help lookups");
  });
});
