import type {
  ModelUsage,
  SDKAssistantMessage,
  SDKResultMessage,
  SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";

// Hand-written fixtures covering only the fields the eval harness reads. The
// full SDK message types carry many fields it never touches (ids, usage
// internals, container info, ...), so fixtures are built minimally and cast
// at the boundary rather than filling in irrelevant required fields.

export const assistantText = (text: string): SDKAssistantMessage =>
  ({
    type: "assistant",
    message: { content: [{ type: "text", text }] },
    parent_tool_use_id: null,
  }) as unknown as SDKAssistantMessage;

export const assistantBash = (toolUseId: string, command: string): SDKAssistantMessage =>
  ({
    type: "assistant",
    message: {
      content: [{ type: "tool_use", id: toolUseId, name: "Bash", input: { command } }],
    },
    parent_tool_use_id: null,
  }) as unknown as SDKAssistantMessage;

export const bashResult = (
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
export const batchedBashResults = (
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

export const resultMessage = (
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
    permission_denials: [],
  }) as unknown as SDKResultMessage;
