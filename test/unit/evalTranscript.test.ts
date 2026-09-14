import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { describe, expect, it } from "vitest";
import type { AgentRun, Denial } from "../../evals/lib/agent.js";
import { buildTaskTrace } from "../../evals/lib/transcript.js";
import { assistantBash, assistantText, bashResult, resultMessage } from "../helpers/sdkMessages.js";

const runWith = (messages: ReadonlyArray<SDKMessage>, extra: Partial<AgentRun> = {}): AgentRun => ({
  messages,
  denials: extra.denials ?? [],
  stderr: extra.stderr ?? "",
  stopReason: extra.stopReason ?? "completed",
});

describe("buildTaskTrace", () => {
  it("counts help lookups across a run", () => {
    const trace = buildTaskTrace(
      runWith([
        assistantBash("t1", "kontent content-type create --help"),
        bashResult("t1", { stdout: "", stderr: "" }),
        assistantBash("t2", "kontent -h"),
        bashResult("t2", { stdout: "", stderr: "" }),
        assistantBash("t3", "kontent docs search taxonomy"),
        bashResult("t3", { stdout: "", stderr: "" }),
        assistantBash("t4", "kontent content-type list"),
        bashResult("t4", { stdout: "", stderr: "" }),
      ]),
    );

    expect(trace.helpLookupCount).toBe(3);
  });

  it("tags agent text with the index of the last command before it", () => {
    const trace = buildTaskTrace(
      runWith([
        assistantText("Let me check the CLI first."),
        assistantBash("t1", "kontent --version"),
        bashResult("t1", { stdout: "1.0.0", stderr: "" }),
        assistantText("Now I will create the type."),
      ]),
    );

    expect(trace.agentTexts).toEqual([
      { afterCommandIndex: -1, text: "Let me check the CLI first." },
      { afterCommandIndex: 0, text: "Now I will create the type." },
    ]);
  });

  it("falls back to the last agent text as finalReply when there is no result message", () => {
    const trace = buildTaskTrace(
      runWith([
        assistantBash("t1", "kontent --version"),
        bashResult("t1", { stdout: "1.0.0", stderr: "" }),
        assistantText("Now I will create the type."),
      ]),
    );

    expect(trace.finalReply).toBe("Now I will create the type.");
  });

  it("prefers the result message's own `result` string as finalReply when present", () => {
    const trace = buildTaskTrace(
      runWith([
        assistantText("An earlier, superseded reply."),
        resultMessage({ resultText: "The actual final answer." }),
      ]),
    );

    expect(trace.finalReply).toBe("The actual final answer.");
  });

  it("reads turns, cost and duration off the terminal result message", () => {
    const trace = buildTaskTrace(
      runWith([
        assistantText("Working on it."),
        resultMessage({ numTurns: 3, durationMs: 4200, costUsd: 0.12 }),
      ]),
    );

    expect(trace.numbers.turns).toBe(3);
    expect(trace.numbers.durationMs).toBe(4200);
    expect(trace.numbers.costUsd).toBe(0.12);
  });

  it("falls back to usage fields when modelUsage is empty", () => {
    const trace = buildTaskTrace(
      runWith([
        resultMessage({
          inputTokens: 500,
          outputTokens: 250,
          cacheReadTokens: 40,
          cacheCreationTokens: 20,
          modelUsage: {},
        }),
      ]),
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
        resultMessage({
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
    );

    expect(trace.numbers).toMatchObject({
      inputTokens: 120,
      outputTokens: 60,
      cacheReadTokens: 12,
      cacheCreationTokens: 6,
    });
  });

  it("counts failed commands across a run", () => {
    const trace = buildTaskTrace(
      runWith([
        assistantBash("t1", "kontent content-type list"),
        bashResult("t1", { stdout: "", stderr: "" }),
        assistantBash("t2", "kontent content-type view --codename missing"),
        bashResult("t2", { stdout: "", stderr: "not found", isError: true }),
      ]),
    );

    expect(trace.failedCommandCount).toBe(1);
  });

  it("carries denials and stopReason straight through from the run", () => {
    const denials: ReadonlyArray<Denial> = [
      { toolName: "Bash", command: "cat ~/.ssh/id_rsa", reason: "outside scratch" },
    ];
    const trace = buildTaskTrace(runWith([], { denials, stopReason: "timeout" }));

    expect(trace.denials).toEqual(denials);
    expect(trace.stopReason).toBe("timeout");
  });
});
