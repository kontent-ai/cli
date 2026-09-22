import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { describe, expect, it } from "vitest";
import type { AgentRun } from "../lib/agent.js";
import type { CliInvocation } from "../lib/invocations.js";
import { buildTaskTrace } from "../lib/transcript.js";
import {
  createAssistantBash,
  createAssistantText,
  createAssistantWebFetch,
  createBashResult,
  createDeniedResult,
  createResultMessage,
  createWebFetchResult,
} from "./helpers/sdkMessages.js";

const runWith = (messages: ReadonlyArray<SDKMessage>, extra: Partial<AgentRun> = {}): AgentRun => ({
  messages,
  stderr: extra.stderr ?? "",
  stopReason: extra.stopReason ?? "completed",
});

describe("buildTaskTrace", () => {
  it("counts web fetches and denied calls across a run", () => {
    const trace = buildTaskTrace(
      runWith([
        createAssistantWebFetch(
          "t4",
          "https://kontent.ai/learn/docs/apis/openapi/management-api-v2",
          "what is the request body shape",
        ),
        createWebFetchResult("t4", { result: "..." }),
        createAssistantBash("t5", "kontent content-type list"),
        createBashResult("t5", { stdout: "", stderr: "" }),
        createAssistantBash("t6", "cat ~/.ssh/id_rsa"),
        createDeniedResult("t6", "command references a path outside the workspace: ~/.ssh/id_rsa"),
      ]),
      [],
    );

    expect(trace.webFetchCount).toBe(1);
    expect(trace.deniedCallCount).toBe(1);
  });

  it("derives invocation counts from the shim's invocation log, not the transcript", () => {
    const invocations: ReadonlyArray<CliInvocation> = [
      { exitCode: 0, args: ["docs", "search", "taxonomy"] },
      { exitCode: 1, args: ["mapi", "--help"] },
    ];
    // Would double every count if the transcript were consulted.
    const messages = [
      createAssistantBash("t1", "kontent docs search taxonomy"),
      createBashResult("t1", { stdout: "", stderr: "" }),
      createAssistantBash("t2", "kontent mapi --help"),
      createBashResult("t2", { stdout: "", stderr: "", isError: true }),
    ];

    const trace = buildTaskTrace(runWith(messages), invocations);

    expect(trace.invocations).toBe(invocations);
    expect(trace.cliInvocationCount).toBe(2);
    expect(trace.failedCliInvocationCount).toBe(1);
    expect(trace.docsLookupCount).toBe(1);
    expect(trace.helpLookupCount).toBe(1);
  });

  it("tags agent text with the index of the last tool call before it", () => {
    const trace = buildTaskTrace(
      runWith([
        createAssistantText("Let me check the CLI first."),
        createAssistantBash("t1", "kontent --version"),
        createBashResult("t1", { stdout: "1.0.0", stderr: "" }),
        createAssistantWebFetch(
          "t2",
          "https://kontent.ai/learn/x",
          "what is the request body shape",
        ),
        createWebFetchResult("t2", { result: "..." }),
        createAssistantText("Now I will create the type."),
      ]),
      [],
    );

    expect(trace.agentTexts).toEqual([
      { afterToolCallIndex: -1, text: "Let me check the CLI first." },
      { afterToolCallIndex: 1, text: "Now I will create the type." },
    ]);
  });

  it("falls back to the last agent text as finalReply when there is no result message", () => {
    const trace = buildTaskTrace(
      runWith([
        createAssistantBash("t1", "kontent --version"),
        createBashResult("t1", { stdout: "1.0.0", stderr: "" }),
        createAssistantText("Now I will create the type."),
      ]),
      [],
    );

    expect(trace.finalReply).toBe("Now I will create the type.");
  });

  it("prefers the result message's own `result` string as finalReply when present", () => {
    const trace = buildTaskTrace(
      runWith([
        createAssistantText("An earlier, superseded reply."),
        createResultMessage({ resultText: "The actual final answer." }),
      ]),
      [],
    );

    expect(trace.finalReply).toBe("The actual final answer.");
  });

  it("falls back to usage fields when modelUsage is empty", () => {
    const trace = buildTaskTrace(
      runWith([
        createResultMessage({
          inputTokens: 500,
          outputTokens: 250,
          cacheReadTokens: 40,
          cacheCreationTokens: 20,
          modelUsage: {},
        }),
      ]),
      [],
    );

    expect(trace.numbers).toMatchObject({
      inputTokens: 500,
      outputTokens: 250,
      cacheReadTokens: 40,
      cacheCreationTokens: 20,
    });
  });

  it("sums token numbers across every modelUsage entry, ignoring usage", () => {
    const trace = buildTaskTrace(
      runWith([
        createResultMessage({
          inputTokens: 999,
          outputTokens: 999,
          modelUsage: {
            "claude-opus": {
              inputTokens: 100,
              outputTokens: 50,
              cacheReadInputTokens: 10,
              cacheCreationInputTokens: 5,
              webSearchRequests: 0,
              costUSD: 0.1,
              contextWindow: 200_000,
              maxOutputTokens: 8192,
            },
            "claude-haiku": {
              inputTokens: 20,
              outputTokens: 10,
              cacheReadInputTokens: 2,
              cacheCreationInputTokens: 1,
              webSearchRequests: 0,
              costUSD: 0.01,
              contextWindow: 200_000,
              maxOutputTokens: 8192,
            },
          },
        }),
      ]),
      [],
    );

    expect(trace.numbers).toMatchObject({
      inputTokens: 120,
      outputTokens: 60,
      cacheReadTokens: 12,
      cacheCreationTokens: 6,
    });
  });
});
