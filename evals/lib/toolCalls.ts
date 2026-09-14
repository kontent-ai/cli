// Turns the raw SDK messages of one agent run into a flat list of tool calls:
// pairs each Bash and WebFetch tool_use with its tool_result (or denial), and
// classifies the outcome.

import type {
  SDKAssistantMessage,
  SDKMessage,
  SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import type { WebFetchOutput } from "@anthropic-ai/claude-agent-sdk/sdk-tools";
import * as z from "zod/mini";
import { findResultMessage } from "./messages.js";
import { AGENT_TOOLS, bashInputSchema, DENIAL_PREFIX, webFetchInputSchema } from "./policy.js";

export type ToolCallTool = "Bash" | "WebFetch";

export type ToolCallOutcome = "ok" | "failed" | "denied" | "no-result";

// For WebFetch, `command` is the URL and `fetchPrompt` the question the agent asked of the page.
export type ToolCall = Readonly<{
  index: number;
  tool: ToolCallTool;
  command: string;
  fetchPrompt: string;
  outcome: ToolCallOutcome;
  stdout: string;
  stderr: string;
  // The SDK's Bash tool result carries no per-command timing, only the turn's
  // total duration, so this stays null for Bash; WebFetch reports its own.
  durationMs: number | null;
}>;

export const isAgentTool = (block: Readonly<{ type: string; name?: string }>): boolean =>
  block.type === "tool_use" && block.name !== undefined && AGENT_TOOLS.includes(block.name);

export const collectToolCalls = (messages: ReadonlyArray<SDKMessage>): ReadonlyArray<ToolCall> => {
  const toolUses = collectToolUses(messages);
  const resultsByToolUseId = collectToolResults(messages);
  const ruleDeniedIds = collectRuleDeniedIds(messages);
  return toolUses.map((toolUse, index) =>
    buildToolCall(
      index,
      toolUse,
      resultsByToolUseId.get(toolUse.id),
      ruleDeniedIds.has(toolUse.id),
    ),
  );
};

type ToolUse = Readonly<{ id: string; tool: ToolCallTool; command: string; fetchPrompt: string }>;

type RawToolResult = Readonly<{ isError: boolean; content: unknown; toolUseResult: unknown }>;

type ToolResult = Readonly<{
  isError: boolean;
  stdout: string;
  stderr: string;
  durationMs: number | null;
}>;

const collectToolUses = (messages: ReadonlyArray<SDKMessage>): ReadonlyArray<ToolUse> =>
  messages
    .filter((message): message is SDKAssistantMessage => message.type === "assistant")
    .flatMap((message) => message.message.content)
    .flatMap((block): ReadonlyArray<ToolUse> => {
      if (block.type !== "tool_use" || !isAgentTool(block)) {
        return [];
      }
      if (block.name === "WebFetch") {
        const parsed = webFetchInputSchema.safeParse(block.input);
        return [
          {
            id: block.id,
            tool: "WebFetch",
            command: parsed.success ? parsed.data.url : "",
            fetchPrompt: parsed.success ? parsed.data.prompt : "",
          },
        ];
      }
      const parsed = bashInputSchema.safeParse(block.input);
      return [
        {
          id: block.id,
          tool: "Bash",
          command: parsed.success ? parsed.data.command : "",
          fetchPrompt: "",
        },
      ];
    });

const collectToolResults = (
  messages: ReadonlyArray<SDKMessage>,
): ReadonlyMap<string, RawToolResult> => {
  const entries = messages
    .filter((message): message is SDKUserMessage => message.type === "user")
    .flatMap((message) => {
      const content = message.message.content;
      if (typeof content === "string") {
        return [];
      }
      const toolResultBlocks = content.filter((block) => block.type === "tool_result");
      // tool_use_result is a per-message field, not per-block: attaching it to
      // every block in a message that batches several tool_results would wrongly
      // give each one the same structured output, so it is only trustworthy when
      // the message carries exactly one.
      const toolUseResult = toolResultBlocks.length === 1 ? message.tool_use_result : undefined;
      return toolResultBlocks.map(
        (block) =>
          [
            block.tool_use_id,
            { isError: block.is_error === true, content: block.content, toolUseResult },
          ] as const,
      );
    });

  return new Map(entries);
};

// A denial shows up as an is_error tool_result, in permission_denials, or both, so both paths are matched.
const collectRuleDeniedIds = (messages: ReadonlyArray<SDKMessage>): ReadonlySet<string> =>
  new Set(
    (findResultMessage(messages)?.permission_denials ?? []).map((denial) => denial.tool_use_id),
  );

const buildToolCall = (
  index: number,
  toolUse: ToolUse,
  raw: RawToolResult | undefined,
  isRuleDenied: boolean,
): ToolCall => {
  const result = parseToolResult(toolUse.tool, raw);
  const outcome = deriveOutcome(result, isRuleDenied);
  const stdout = outcome === "denied" || result === undefined ? "" : result.stdout;
  const stderr = deriveStderr(outcome, result);

  return {
    index,
    tool: toolUse.tool,
    command: toolUse.command,
    fetchPrompt: toolUse.fetchPrompt,
    outcome,
    stdout,
    stderr,
    durationMs: result === undefined ? null : result.durationMs,
  };
};

const parseToolResult = (
  tool: ToolCallTool,
  raw: RawToolResult | undefined,
): ToolResult | undefined => {
  if (raw === undefined) {
    return undefined;
  }
  return tool === "Bash" ? parseBashResult(raw) : parseWebFetchResult(raw);
};

const bashOutputSchema = z.object({ stdout: z.string(), stderr: z.string() });

const parseBashResult = (raw: RawToolResult): ToolResult => {
  const parsed = bashOutputSchema.safeParse(raw.toolUseResult);
  if (parsed.success) {
    return {
      isError: raw.isError,
      stdout: parsed.data.stdout,
      stderr: parsed.data.stderr,
      durationMs: null,
    };
  }
  return { isError: raw.isError, stdout: textContentOf(raw.content), stderr: "", durationMs: null };
};

const webFetchOutputSchema = z.object({
  result: z.string(),
  durationMs: z.number(),
}) satisfies z.ZodMiniType<Pick<WebFetchOutput, "result" | "durationMs">>;

const parseWebFetchResult = (raw: RawToolResult): ToolResult => {
  const parsed = webFetchOutputSchema.safeParse(raw.toolUseResult);
  if (parsed.success) {
    return {
      isError: raw.isError,
      stdout: parsed.data.result,
      stderr: "",
      durationMs: parsed.data.durationMs,
    };
  }
  return { isError: raw.isError, stdout: textContentOf(raw.content), stderr: "", durationMs: null };
};

const textContentOf = (content: unknown): string => {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    const textBlock = content.find(
      (block): block is { type: "text"; text: string } =>
        typeof block === "object" &&
        block !== null &&
        (block as { type?: unknown }).type === "text",
    );
    return textBlock?.text ?? "";
  }
  return "";
};

const deriveOutcome = (result: ToolResult | undefined, isRuleDenied: boolean): ToolCallOutcome => {
  const isHookDenied = result?.isError === true && result.stdout.startsWith(DENIAL_PREFIX);
  if (isHookDenied || isRuleDenied) {
    return "denied";
  }
  if (result === undefined) {
    return "no-result";
  }
  return result.isError ? "failed" : "ok";
};

const deriveStderr = (outcome: ToolCallOutcome, result: ToolResult | undefined): string => {
  if (outcome !== "denied") {
    return result === undefined ? "" : result.stderr;
  }
  return result === undefined ? "not pre-approved by the permission rules" : result.stdout;
};
