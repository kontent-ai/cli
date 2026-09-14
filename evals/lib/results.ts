import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import type { AgentRun } from "./agent.js";
import { AGENT_PERMISSION_RULES, AGENT_TOOLS } from "./policy.js";
import { renderRunReport, renderTaskReport } from "./report/markdown.js";
import type { TaskTrace } from "./transcript.js";
import type { Assertion, Verdict } from "./types.js";

const execFileAsync = promisify(execFile);

export type RunSummaryHeader = Readonly<{
  model: string;
  tools: ReadonlyArray<string>;
  permissionRules: ReadonlyArray<string>;
  maxTurns: number;
  cliVersion: string;
  gitSha: string;
  envId: string;
  preambleHash: string;
  startedAt: string;
  finishedAt: string;
}>;

export type RunSummaryRow = Readonly<{
  id: string;
  verdict: Verdict;
  turns: number;
  toolCallCount: number;
  failedCallCount: number;
  deniedCallCount: number;
  helpLookupCount: number;
  docsLookupCount: number;
  webFetchCount: number;
  costUsd: number;
  durationMs: number;
  stopReason: string;
}>;

export type RunSummary = Readonly<{
  header: RunSummaryHeader;
  rows: ReadonlyArray<RunSummaryRow>;
}>;

export type TaskResultInput = Readonly<{
  trace: TaskTrace;
  run: AgentRun | undefined;
  verdict: Verdict;
  assertions: ReadonlyArray<Assertion>;
  // Set for ERROR verdicts: the agent-run or check failure that produced them,
  // so it survives on disk instead of only ever appearing in a thrown Error.
  errorMessage?: string;
}>;

// Creates evals/results/<date>-<time>-<model>/tasks, date and time both UTC
// from the same instant, so a run's directory name doubles as its start time.
export const createRunDirectory = async (root: string, model: string): Promise<string> => {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const time = now.toISOString().slice(11, 16).replace(":", "");
  const runDir = `${root}/${date}-${time}-${model}`;
  await mkdir(`${runDir}/tasks`, { recursive: true });
  return runDir;
};

export const writeTaskResult = async (
  runDir: string,
  taskId: string,
  data: TaskResultInput,
  mapiKey: string,
): Promise<void> => {
  const taskJson = {
    taskId,
    verdict: data.verdict,
    assertions: data.assertions,
    trace: data.trace,
    errorMessage: data.errorMessage,
  };
  await writeFile(
    `${runDir}/tasks/${taskId}.json`,
    redactSecret(`${JSON.stringify(taskJson, null, 2)}\n`, mapiKey),
  );

  const rawLines = (data.run?.messages ?? []).map((message) => JSON.stringify(message));
  await writeFile(
    `${runDir}/tasks/${taskId}.raw.jsonl`,
    redactSecret(rawLines.length === 0 ? "" : `${rawLines.join("\n")}\n`, mapiKey),
  );

  await writeFile(
    `${runDir}/tasks/${taskId}.md`,
    redactSecret(
      renderTaskReport(taskId, data.trace, data.verdict, data.assertions, data.errorMessage),
      mapiKey,
    ),
  );
};

export const writeRunSummary = async (
  runDir: string,
  summary: RunSummary,
  traces: ReadonlyArray<Readonly<{ id: string; trace: TaskTrace }>>,
  mapiKey: string,
): Promise<void> => {
  const runJson = { ...summary.header, tasks: summary.rows };
  await writeFile(
    `${runDir}/run.json`,
    redactSecret(`${JSON.stringify(runJson, null, 2)}\n`, mapiKey),
  );
  await writeFile(`${runDir}/report.md`, redactSecret(renderRunReport(summary, traces), mapiKey));
};

export const buildRunHeader = async (
  params: Readonly<{
    repoRoot: string;
    model: string;
    envId: string;
    preamble: string;
    startedAt: string;
    maxTurns: number;
  }>,
): Promise<RunSummaryHeader> => {
  const [cliVersion, gitSha] = await Promise.all([
    detectCliVersion(params.repoRoot),
    detectGitSha(params.repoRoot),
  ]);

  return {
    model: params.model,
    tools: AGENT_TOOLS,
    permissionRules: AGENT_PERMISSION_RULES,
    maxTurns: params.maxTurns,
    cliVersion,
    gitSha,
    envId: params.envId,
    preambleHash: hashPreamble(params.preamble),
    startedAt: params.startedAt,
    finishedAt: new Date().toISOString(),
  };
};

const redactSecret = (text: string, secret: string): string =>
  secret === "" ? text : text.split(secret).join("[REDACTED]");

// Reads dist/index.mjs --version rather than package.json directly, so the
// recorded version is what the agent actually ran against; falls back to
// package.json only if the build is somehow unreadable.
const detectCliVersion = async (repoRoot: string): Promise<string> => {
  try {
    const { stdout } = await execFileAsync("node", [`${repoRoot}/dist/index.mjs`, "--version"]);
    return stdout.trim();
  } catch {
    const raw = await readFile(`${repoRoot}/package.json`, "utf8");
    return (JSON.parse(raw) as { version?: string }).version ?? "unknown";
  }
};

const detectGitSha = async (repoRoot: string): Promise<string> => {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "--short", "HEAD"], {
      cwd: repoRoot,
    });
    return stdout.trim();
  } catch {
    return "unknown";
  }
};

// Short enough to eyeball in run.json, long enough that two different
// preambles essentially never collide.
const hashPreamble = (preamble: string): string =>
  createHash("sha256").update(preamble).digest("hex").slice(0, 12);
