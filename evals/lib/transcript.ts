// Turns one agent run's messages plus its tool-call trace into the TaskTrace
// shape the reports render from: final reply, timing and cost numbers,
// alongside the tool calls collectToolCalls already extracted.

import type {
  ModelUsage,
  NonNullableUsage,
  SDKAssistantMessage,
  SDKMessage,
} from "@anthropic-ai/claude-agent-sdk";
import type { AgentRun } from "./agent.js";
import { type CliInvocation, countInvocations } from "./invocations.js";
import { findResultMessage } from "./messages.js";
import { collectToolCalls, isAgentTool, type ToolCall } from "./toolCalls.js";

export type AgentText = Readonly<{
  afterToolCallIndex: number;
  text: string;
}>;

export type TaskTrace = Readonly<{
  toolCalls: ReadonlyArray<ToolCall>;
  agentTexts: ReadonlyArray<AgentText>;
  finalReply: string;
  numbers: Readonly<{
    turns: number;
    durationMs: number;
    costUsd: number;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
  }>;
  stopReason: string;
  invocations: ReadonlyArray<CliInvocation>;
  cliInvocationCount: number;
  failedCliInvocationCount: number;
  helpLookupCount: number;
  docsLookupCount: number;
  webFetchCount: number;
  deniedCallCount: number;
}>;

export const buildTaskTrace = (
  run: AgentRun,
  invocations: ReadonlyArray<CliInvocation>,
): TaskTrace => {
  const toolCalls = collectToolCalls(run.messages);
  const agentTexts = collectAgentTexts(run.messages);

  return {
    toolCalls,
    agentTexts,
    finalReply: deriveFinalReply(run.messages, agentTexts),
    numbers: deriveNumbers(run.messages),
    stopReason: run.stopReason,
    invocations,
    ...countInvocations(invocations),
    webFetchCount: toolCalls.filter((call) => call.tool === "WebFetch").length,
    deniedCallCount: toolCalls.filter((call) => call.outcome === "denied").length,
  };
};

// Tags every assistant text block with the index of the last tool call before
// it, or -1 for text before any.
const collectAgentTexts = (messages: ReadonlyArray<SDKMessage>): ReadonlyArray<AgentText> =>
  messages
    .filter((message): message is SDKAssistantMessage => message.type === "assistant")
    .flatMap((message) => message.message.content)
    .reduce(
      (acc, block) => {
        if (isAgentTool(block)) {
          return { callsSeen: acc.callsSeen + 1, texts: acc.texts };
        }
        if (block.type === "text") {
          const text = { afterToolCallIndex: acc.callsSeen - 1, text: block.text };
          return { callsSeen: acc.callsSeen, texts: acc.texts.concat(text) };
        }
        return acc;
      },
      { callsSeen: 0, texts: [] as ReadonlyArray<AgentText> },
    ).texts;

// The result message's own `result` string is the reply the SDK considers
// final, and is present even when the last assistant text block was
// superseded by further tool use; the last agent text block is only a
// fallback for a run that never produced a result message (e.g. a timeout).
const deriveFinalReply = (
  messages: ReadonlyArray<SDKMessage>,
  agentTexts: ReadonlyArray<AgentText>,
): string => {
  const result = findResultMessage(messages);
  if (result !== undefined && result.subtype === "success") {
    return result.result;
  }
  return agentTexts.at(-1)?.text ?? "";
};

const emptyTokenTotals = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
};

// usage.* is main-loop-only and excludes cache tokens; modelUsage is the
// correct source (per-model, includes cache reads/creations), summed across
// every model the run touched. usage stays as the fallback for a result that
// predates modelUsage or reports it empty.
const deriveNumbers = (messages: ReadonlyArray<SDKMessage>): TaskTrace["numbers"] => {
  const result = findResultMessage(messages);
  if (result === undefined) {
    return { turns: 0, durationMs: 0, costUsd: 0, ...emptyTokenTotals };
  }

  const modelUsages = Object.values(result.modelUsage);
  const tokenTotals =
    modelUsages.length === 0 ? tokensFromUsage(result.usage) : sumModelUsage(modelUsages);

  return {
    turns: result.num_turns,
    durationMs: result.duration_ms,
    costUsd: result.total_cost_usd,
    ...tokenTotals,
  };
};

const tokensFromUsage = (usage: NonNullableUsage): typeof emptyTokenTotals => ({
  inputTokens: usage.input_tokens,
  outputTokens: usage.output_tokens,
  cacheReadTokens: usage.cache_read_input_tokens,
  cacheCreationTokens: usage.cache_creation_input_tokens,
});

const sumModelUsage = (usages: ReadonlyArray<ModelUsage>): typeof emptyTokenTotals =>
  usages.reduce(
    (totals, usage) => ({
      inputTokens: totals.inputTokens + usage.inputTokens,
      outputTokens: totals.outputTokens + usage.outputTokens,
      cacheReadTokens: totals.cacheReadTokens + usage.cacheReadInputTokens,
      cacheCreationTokens: totals.cacheCreationTokens + usage.cacheCreationInputTokens,
    }),
    emptyTokenTotals,
  );
