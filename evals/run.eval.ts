import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { afterAll, describe, expect, inject, it } from "vitest";
import { createMapiClient } from "../src/lib/mapi/client.js";
import { isErr } from "../src/lib/result.js";
import type { AgentRun } from "./lib/agent.js";
import { runTaskAgent } from "./lib/agent.js";
import { parseInvocationLog } from "./lib/invocations.js";
import { buildTaskPrompt } from "./lib/prompt.js";
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

const TASK_TIMEOUT_MS = 10 * 60_000;
const MAX_TURNS = 60;

// Fail loudly at collection time: a broken task graph is a setup error, not
// something a single `it` should discover mid-run.
const orderResult = resolveExecutionOrder(evalTasks);
if (isErr(orderResult)) {
  throw new Error(orderResult.error);
}
const orderedTasks = orderResult.value;

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
          envId: evalsContext.envId,
          workspaceDir,
          taskPrompt: task.prompt,
        });
        const invocationLogPath = join(evalsContext.runDir, "tasks", `${task.id}.invocations`);

        const runResult = await runTaskAgent(
          {
            prompt,
            model: evalsContext.model,
            workspaceDir,
            envId: evalsContext.envId,
            mapiKey: evalsContext.mapiKey,
            cliBinDir: evalsContext.cliBinDir,
            invocationLogPath,
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

        const invocations = parseInvocationLog(await readInvocationLog(invocationLogPath));
        const trace = buildTaskTrace(runResult.value, invocations);
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
    cliEntry: evalsContext.cliEntry,
    cliPackage: evalsContext.cliPackage,
    model: evalsContext.model,
    envId: evalsContext.envId,
    startedAt,
    maxTurns: MAX_TURNS,
  });

  const rows = outcomes.map(toSummaryRow);
  const traces = outcomes.map(({ id, trace }) => ({ id, trace }));

  await writeRunSummary(evalsContext.runDir, { header, rows }, traces, evalsContext.mapiKey);
});

const blankTrace = (stopReason: AgentRun["stopReason"]): TaskTrace =>
  buildTaskTrace({ messages: [], stderr: "", stopReason }, []);

// A missing log means the agent never ran `kontent`, not a real failure.
const readInvocationLog = async (path: string): Promise<string> => {
  try {
    return await readFile(path, "utf8");
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") {
      return "";
    }
    throw cause;
  }
};

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
  cliInvocationCount: trace.cliInvocationCount,
  failedCliInvocationCount: trace.failedCliInvocationCount,
  deniedCallCount: trace.deniedCallCount,
  helpLookupCount: trace.helpLookupCount,
  docsLookupCount: trace.docsLookupCount,
  webFetchCount: trace.webFetchCount,
  costUsd: trace.numbers.costUsd,
  inputTokens: trace.numbers.inputTokens,
  outputTokens: trace.numbers.outputTokens,
  durationMs: trace.numbers.durationMs,
  stopReason: trace.stopReason,
});
