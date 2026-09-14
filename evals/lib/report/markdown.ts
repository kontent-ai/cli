import type { RunSummary, RunSummaryHeader, RunSummaryRow } from "../results.js";
import type { ToolCall, ToolCallOutcome } from "../toolCalls.js";
import type { TaskTrace } from "../transcript.js";
import type { Assertion, Verdict } from "../types.js";

// Nice-to-have, not load-bearing: every function here is a pure string
// renderer with no LLM calls and no network access, so deleting this whole
// folder (and the one call into it from results.ts) removes the feature
// cleanly.

export const renderTaskReport = (
  taskId: string,
  trace: TaskTrace,
  verdict: Verdict,
  assertions: ReadonlyArray<Assertion>,
  errorMessage?: string,
): string =>
  [
    `# ${taskId}: ${verdict}`,
    "",
    renderStatsLine(trace),
    "",
    ...renderErrorSection(errorMessage),
    "## Assertions",
    ...renderAssertions(assertions),
    "",
    "## Tool calls",
    ...renderToolCalls(trace),
    "",
    "## Denied",
    ...renderDenied(trace.toolCalls),
    "",
    "## Agent final reply",
    trace.finalReply,
    "",
  ].join("\n");

export const renderRunReport = (
  summary: RunSummary,
  traces: ReadonlyArray<Readonly<{ id: string; trace: TaskTrace }>>,
): string =>
  [
    renderHeader(summary.header),
    "",
    renderTable(summary.rows),
    "",
    renderTotals(summary.rows),
    "",
    "## Friction",
    "",
    "### Failed calls",
    ...renderFailedCalls(traces),
    "",
    "### Web fetches",
    ...renderWebFetches(traces),
    "",
    "## Agent final replies",
    ...renderFinalReplies(traces),
    "",
  ].join("\n");

const renderStatsLine = (trace: TaskTrace): string =>
  `turns ${trace.numbers.turns} | calls ${trace.toolCalls.length} | cli ${trace.cliInvocationCount} | failed ${trace.failedCliInvocationCount} | denied ${trace.deniedCallCount} | ` +
  `help ${trace.helpLookupCount} | docs ${trace.docsLookupCount} | fetch ${trace.webFetchCount} | ` +
  `cost $${trace.numbers.costUsd.toFixed(2)} | ` +
  `tokens in ${trace.numbers.inputTokens} | out ${trace.numbers.outputTokens} | cache ${trace.numbers.cacheReadTokens + trace.numbers.cacheCreationTokens} | ` +
  `${formatDuration(trace.numbers.durationMs)} | stop: ${trace.stopReason}`;

const renderErrorSection = (errorMessage: string | undefined): ReadonlyArray<string> =>
  errorMessage === undefined ? [] : ["## Error", "", errorMessage, ""];

const renderAssertions = (assertions: ReadonlyArray<Assertion>): ReadonlyArray<string> =>
  assertions.length === 0
    ? ["(none)"]
    : assertions.map(
        (assertion) =>
          `- ${assertion.passed ? "PASS" : "FAIL"} ${assertion.id}  ${assertion.evidence}`,
      );

const renderToolCalls = (trace: TaskTrace): ReadonlyArray<string> => {
  const beforeFirstCall = renderAgentTextsAfter(trace, -1);
  const calls =
    trace.toolCalls.length === 0
      ? ["(none)"]
      : trace.toolCalls.flatMap((call) => renderToolCall(call, trace));
  return [...beforeFirstCall, ...calls];
};

const renderAgentTextsAfter = (
  trace: TaskTrace,
  afterToolCallIndex: number,
): ReadonlyArray<string> =>
  trace.agentTexts
    .filter((text) => text.afterToolCallIndex === afterToolCallIndex)
    .map((text) => `> agent: "${text.text}"`);

const STATUS_LABELS: Readonly<Record<ToolCallOutcome, string>> = {
  ok: "ok",
  failed: "FAIL",
  denied: "DENIED",
  "no-result": "NORESULT",
};

const renderToolCall = (call: ToolCall, trace: TaskTrace): ReadonlyArray<string> => {
  const status = STATUS_LABELS[call.outcome].padEnd(8);
  const duration = formatDuration(call.durationMs).padStart(6);
  const header = `${call.index + 1}. ${status} ${duration}  ${renderInvocation(call)}`;
  const errorLine = call.outcome === "ok" ? [] : [`     ${firstErrorLine(call)}`];
  const replies = trace.agentTexts
    .filter((text) => text.afterToolCallIndex === call.index)
    .map((text) => `   > agent: "${text.text}"`);

  return [header, ...errorLine, ...replies];
};

const renderInvocation = (call: ToolCall): string =>
  call.tool === "WebFetch"
    ? `WebFetch ${call.command} ("${call.fetchPrompt}")`
    : `\`${call.command}\``;

// Bash commands can be multi-line heredocs; only the first line is shown so a
// failed call's body (e.g. JSON piped into a file) doesn't flood the report.
const renderFirstLine = (call: ToolCall): string =>
  call.tool === "WebFetch" ? renderInvocation(call) : `\`${call.command.split("\n")[0]?.trim()}\``;

const firstErrorLine = (call: ToolCall): string =>
  firstNonEmptyLine(call.stderr) ?? firstNonEmptyLine(call.stdout) ?? "(no output)";

const firstNonEmptyLine = (text: string): string | undefined =>
  text
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line !== "");

const renderDenied = (toolCalls: ReadonlyArray<ToolCall>): ReadonlyArray<string> => {
  const denied = toolCalls.filter((call) => call.outcome === "denied");
  return denied.length === 0
    ? ["(none)"]
    : denied.map((call) => `- ${call.tool} \`${call.command}\` (${call.stderr})`);
};

const renderHeader = (header: RunSummaryHeader): string =>
  `# Eval run: ${header.model} @ ${header.envId} (${header.startedAt})\n\n` +
  `cli ${header.cliVersion} | git ${header.gitSha} | tools ${header.tools.join(", ")} | ` +
  `rules ${header.permissionRules.join(", ")} | max turns ${header.maxTurns} | ` +
  `preamble ${header.preambleHash}`;

const renderTable = (rows: ReadonlyArray<RunSummaryRow>): string =>
  [
    "| task | verdict | turns | calls | cli | failed | denied | help | docs | fetch | cost | in | out | time |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...rows.map(
      (row) =>
        `| ${row.id} | ${row.verdict} | ${row.turns} | ${row.toolCallCount} | ${row.cliInvocationCount} | ${row.failedCliInvocationCount} | ` +
        `${row.deniedCallCount} | ${row.helpLookupCount} | ${row.docsLookupCount} | ${row.webFetchCount} | ` +
        `$${row.costUsd.toFixed(2)} | ${formatThousands(row.inputTokens)} | ${formatThousands(row.outputTokens)} | ${formatDuration(row.durationMs)} |`,
    ),
  ].join("\n");

const formatThousands = (count: number): string => `${Math.round(count / 1000)}k`;

const renderTotals = (rows: ReadonlyArray<RunSummaryRow>): string => {
  const passCount = rows.filter((row) => row.verdict === "PASS").length;
  const totalCost = rows.reduce((sum, row) => sum + row.costUsd, 0);
  const totalDuration = rows.reduce((sum, row) => sum + row.durationMs, 0);
  return `${passCount}/${rows.length} passed | total cost $${totalCost.toFixed(2)} | total time ${formatDuration(totalDuration)}`;
};

// Every failure listed, not grouped: with single-digit counts per run, a prefix heuristic hides more than it shows.
const renderFailedCalls = (
  traces: ReadonlyArray<Readonly<{ id: string; trace: TaskTrace }>>,
): ReadonlyArray<string> => {
  const failed = traces.flatMap(({ id, trace }) =>
    trace.toolCalls
      .filter((call) => call.outcome === "failed")
      .map((call) => `- ${id}: ${renderFirstLine(call)}  ${firstErrorLine(call)}`),
  );
  return failed.length === 0 ? ["(none)"] : failed;
};

// Every fetch listed, not top groups: each one marks where the CLI's own docs did not carry the agent.
const renderWebFetches = (
  traces: ReadonlyArray<Readonly<{ id: string; trace: TaskTrace }>>,
): ReadonlyArray<string> => {
  const fetches = traces.flatMap(({ id, trace }) =>
    trace.toolCalls
      .filter((call) => call.tool === "WebFetch")
      .map((call) => `- ${id}: ${STATUS_LABELS[call.outcome]} ${renderInvocation(call)}`),
  );
  return fetches.length === 0 ? ["(none)"] : fetches;
};

const renderFinalReplies = (
  traces: ReadonlyArray<Readonly<{ id: string; trace: TaskTrace }>>,
): ReadonlyArray<string> =>
  traces.flatMap(({ id, trace }) => [`### ${id}`, "", trace.finalReply, ""]);

const formatDuration = (ms: number | null): string => {
  if (ms === null) {
    return "-";
  }
  const totalSeconds = ms / 1000;
  return totalSeconds >= 60
    ? `${Math.floor(totalSeconds / 60)}m ${Math.round(totalSeconds % 60)}s`
    : `${totalSeconds.toFixed(1)}s`;
};
