import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { afterAll, describe, expect, inject, it } from "vitest";
import { createMapiClient } from "../src/lib/mapi/client.js";
import { isErr } from "../src/lib/result.js";
import type { AgentRun } from "./lib/agent.js";
import { runTaskAgent } from "./lib/agent.js";
import { buildTaskPrompt, readPreamble } from "./lib/prompt.js";
import { evalTasks } from "./lib/registry.js";
import {
  buildRunHeader,
  type RunSummaryRow,
  writeRunSummary,
  writeTaskResult,
} from "./lib/results.js";
import { resolveExecutionOrder } from "./lib/tasks.js";
import { buildTaskTrace, type TaskTrace } from "./lib/transcript.js";
import type { Assertion, TaskId, Verdict } from "./lib/types.js";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const preamblePath = fileURLToPath(new URL("preamble.md", import.meta.url));

const TASK_TIMEOUT_MS = 10 * 60_000;
const MAX_TURNS = 40;

// Fail loudly at collection time: a broken task graph is a setup error, not
// something a single `it` should discover mid-run.
const orderResult = resolveExecutionOrder(evalTasks);
if (isErr(orderResult)) {
  throw new Error(orderResult.error);
}
const orderedTasks = orderResult.value;

const preamble = await readPreamble(preamblePath);
const startedAt = new Date().toISOString();

type TaskOutcome = Readonly<{ id: TaskId; verdict: Verdict; trace: TaskTrace }>;

const outcomes: TaskOutcome[] = [];

const evalsContext = inject("evals");

describe.sequential("evals", () => {
  for (const task of orderedTasks) {
    it(
      task.id,
      // biome-ignore lint/style/noDoneCallback: `ctx` is Vitest's TestContext (for ctx.skip), not a done callback
      async (ctx) => {
        const unmetParents = task.dependsOn.filter(
          (parentId) => outcomes.find((outcome) => outcome.id === parentId)?.verdict !== "PASS",
        );
        if (unmetParents.length > 0) {
          await recordVerdict(task.id, "BLOCKED", blankTrace("not-run"), []);
          ctx.skip(`dependencies did not PASS: ${unmetParents.join(", ")}`);
        }

        const workspaceDir = await mkdtemp(join(tmpdir(), `kontent-eval-${task.id}-`));
        const prompt = buildTaskPrompt({
          preamble,
          envId: evalsContext.envId,
          workspaceDir,
          taskPrompt: task.prompt,
        });

        const runResult = await runTaskAgent(
          {
            prompt,
            model: evalsContext.model,
            workspaceDir,
            envId: evalsContext.envId,
            mapiKey: evalsContext.mapiKey,
            cliBinDir: evalsContext.cliBinDir,
            timeoutMs: TASK_TIMEOUT_MS,
            maxTurns: MAX_TURNS,
          },
          { query },
        );

        if (isErr(runResult)) {
          await recordVerdict(
            task.id,
            "ERROR",
            blankTrace("error"),
            [],
            undefined,
            runResult.error,
          );
          throw new Error(runResult.error);
        }

        const trace = buildTaskTrace(runResult.value);
        const mapiClient = createMapiClient({
          token: evalsContext.mapiKey,
          envId: evalsContext.envId,
        });
        const checkResult = await task.check(mapiClient);

        if (isErr(checkResult)) {
          await recordVerdict(task.id, "ERROR", trace, [], runResult.value, checkResult.error);
          throw new Error(checkResult.error);
        }

        const assertions = checkResult.value;
        const verdict = deriveVerdict(assertions);
        await recordVerdict(task.id, verdict, trace, assertions, runResult.value);

        expect(verdict).toBe("PASS");
      },
      TASK_TIMEOUT_MS + 60_000,
    );
  }
});

afterAll(async () => {
  const header = await buildRunHeader({
    repoRoot,
    model: evalsContext.model,
    envId: evalsContext.envId,
    preamble,
    startedAt,
    maxTurns: MAX_TURNS,
  });

  const rows = outcomes.map(toSummaryRow);
  const traces = outcomes.map(({ id, trace }) => ({ id, trace }));

  await writeRunSummary(evalsContext.runDir, { header, rows }, traces, evalsContext.mapiKey);
});

const blankTrace = (stopReason: AgentRun["stopReason"]): TaskTrace =>
  buildTaskTrace({ messages: [], stderr: "", stopReason });

const deriveVerdict = (assertions: ReadonlyArray<Assertion>): Verdict => {
  if (assertions.length === 0) {
    return "FAIL";
  }
  return assertions.every((assertion) => assertion.passed) ? "PASS" : "FAIL";
};

// Writes the task's result file, and appends to the run-level outcomes.
const recordVerdict = async (
  taskId: TaskId,
  verdict: Verdict,
  trace: TaskTrace,
  assertions: ReadonlyArray<Assertion>,
  run?: AgentRun,
  errorMessage?: string,
): Promise<void> => {
  await writeTaskResult(
    evalsContext.runDir,
    taskId,
    { trace, run, verdict, assertions, errorMessage },
    evalsContext.mapiKey,
  );
  outcomes.push({ id: taskId, verdict, trace });
};

const toSummaryRow = ({ id, verdict, trace }: TaskOutcome): RunSummaryRow => ({
  id,
  verdict,
  turns: trace.numbers.turns,
  toolCallCount: trace.toolCalls.length,
  failedCallCount: trace.failedCallCount,
  deniedCallCount: trace.deniedCallCount,
  helpLookupCount: trace.helpLookupCount,
  docsLookupCount: trace.docsLookupCount,
  webFetchCount: trace.webFetchCount,
  costUsd: trace.numbers.costUsd,
  durationMs: trace.numbers.durationMs,
  stopReason: trace.stopReason,
});
