import type {
  ModelUsage,
  SDKAssistantMessage,
  SDKResultMessage,
  SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import { DENIAL_PREFIX } from "../../lib/policy.js";

export const createAssistantText = (text: string): SDKAssistantMessage =>
  ({
    type: "assistant",
    message: { content: [{ type: "text", text }] },
    parent_tool_use_id: null,
  }) as unknown as SDKAssistantMessage;

export const createAssistantBash = (toolUseId: string, command: string): SDKAssistantMessage =>
  ({
    type: "assistant",
    message: {
      content: [{ type: "tool_use", id: toolUseId, name: "Bash", input: { command } }],
    },
    parent_tool_use_id: null,
  }) as unknown as SDKAssistantMessage;

export const createAssistantWebFetch = (
  toolUseId: string,
  url: string,
  prompt: string,
): SDKAssistantMessage =>
  ({
    type: "assistant",
    message: {
      content: [{ type: "tool_use", id: toolUseId, name: "WebFetch", input: { url, prompt } }],
    },
    parent_tool_use_id: null,
  }) as unknown as SDKAssistantMessage;

export const createWebFetchResult = (
  toolUseId: string,
  data: Readonly<{ result: string; durationMs?: number }>,
): SDKUserMessage =>
  ({
    type: "user",
    message: {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: toolUseId,
          is_error: false,
          content: data.result,
        },
      ],
    },
    parent_tool_use_id: null,
    tool_use_result: {
      bytes: data.result.length,
      code: 200,
      codeText: "OK",
      result: data.result,
      durationMs: data.durationMs ?? 1500,
      url: "",
    },
  }) as unknown as SDKUserMessage;

export const createDeniedResult = (toolUseId: string, reason: string): SDKUserMessage =>
  ({
    type: "user",
    message: {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: toolUseId,
          is_error: true,
          content: DENIAL_PREFIX + reason,
        },
      ],
    },
    parent_tool_use_id: null,
    tool_use_result: `Error: ${DENIAL_PREFIX}${reason}`,
  }) as unknown as SDKUserMessage;

export const createBashResult = (
  toolUseId: string,
  data: Readonly<{ stdout: string; stderr: string; isError?: boolean }>,
): SDKUserMessage =>
  ({
    type: "user",
    message: {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: toolUseId,
          is_error: data.isError ?? false,
          content: data.stdout,
        },
      ],
    },
    parent_tool_use_id: null,
    tool_use_result: { stdout: data.stdout, stderr: data.stderr, interrupted: false },
  }) as unknown as SDKUserMessage;

// A single user message batching more than one tool_result, all sharing the
// message-level tool_use_result field - the shape that catches a renderer
// which naively attaches that shared field to every block in the message.
export const createBatchedBashResults = (
  entries: ReadonlyArray<Readonly<{ toolUseId: string; content: string; isError?: boolean }>>,
  sharedToolUseResult: unknown,
): SDKUserMessage =>
  ({
    type: "user",
    message: {
      role: "user",
      content: entries.map((entry) => ({
        type: "tool_result",
        tool_use_id: entry.toolUseId,
        is_error: entry.isError ?? false,
        content: entry.content,
      })),
    },
    parent_tool_use_id: null,
    tool_use_result: sharedToolUseResult,
  }) as unknown as SDKUserMessage;

export const createResultMessage = (
  data: Readonly<{
    subtype?: string;
    resultText?: string;
    numTurns?: number;
    durationMs?: number;
    costUsd?: number;
    inputTokens?: number;
    outputTokens?: number;
    cacheReadTokens?: number;
    cacheCreationTokens?: number;
    modelUsage?: Record<string, ModelUsage>;
    permissionDenials?: ReadonlyArray<
      Readonly<{ tool_name: string; tool_use_id: string; tool_input: unknown }>
    >;
  }> = {},
): SDKResultMessage =>
  ({
    type: "result",
    subtype: data.subtype ?? "success",
    is_error: false,
    duration_ms: data.durationMs ?? 1000,
    duration_api_ms: data.durationMs ?? 1000,
    num_turns: data.numTurns ?? 1,
    result: data.resultText ?? "done",
    stop_reason: null,
    total_cost_usd: data.costUsd ?? 0.05,
    usage: {
      input_tokens: data.inputTokens ?? 100,
      output_tokens: data.outputTokens ?? 50,
      cache_read_input_tokens: data.cacheReadTokens ?? 0,
      cache_creation_input_tokens: data.cacheCreationTokens ?? 0,
    },
    modelUsage: data.modelUsage ?? {},
    permission_denials: data.permissionDenials ?? [],
  }) as unknown as SDKResultMessage;
