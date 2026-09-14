import type {
  HookCallback,
  Options,
  query as queryFn,
  SDKMessage,
} from "@anthropic-ai/claude-agent-sdk";
import { err, isErr, ok, type Result } from "../../src/lib/result.js";
import { describeCause } from "./inspect.js";
import { findResultMessage } from "./messages.js";
import { AGENT_PERMISSION_RULES, AGENT_TOOLS, applyToolPolicy, type ToolPolicy } from "./policy.js";

export type AgentRun = Readonly<{
  messages: ReadonlyArray<SDKMessage>;
  stderr: string;
  stopReason: "completed" | "timeout" | "max_turns" | "error" | "not-run";
}>;

export type RunTaskAgentParams = Readonly<{
  prompt: string;
  model: string;
  workspaceDir: string;
  envId: string;
  mapiKey: string;
  cliBinDir: string;
  invocationLogPath: string;
  timeoutMs: number;
  maxTurns: number;
}>;

// The SDK's own `query` function, injected rather than imported directly so a
// test can supply a fake stream without spawning the real Claude Code
// subprocess.
export type AgentSdkQuery = typeof queryFn;

export const runTaskAgent = async (
  params: RunTaskAgentParams,
  deps: Readonly<{ query: AgentSdkQuery }>,
): Promise<Result<AgentRun, string>> => {
  const messages: SDKMessage[] = [];
  const stderrChunks: string[] = [];
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), params.timeoutMs);

  try {
    const stream = deps.query({
      prompt: params.prompt,
      options: buildOptions(params, abortController, stderrChunks),
    });

    for await (const message of stream) {
      messages.push(message);
    }

    return ok({
      messages,
      stderr: stderrChunks.join(""),
      stopReason: deriveStopReason(messages),
    });
  } catch (cause) {
    if (abortController.signal.aborted) {
      return ok({ messages, stderr: stderrChunks.join(""), stopReason: "timeout" });
    }
    return err(`Running the agent failed: ${describeCause(cause)}`);
  } finally {
    clearTimeout(timeoutId);
  }
};

const buildOptions = (
  params: RunTaskAgentParams,
  abortController: AbortController,
  stderrChunks: string[],
): Options => ({
  model: params.model,
  // Restricts the built-in toolset itself, unlike `allowedTools`, which only
  // auto-approves without narrowing what the model can attempt.
  tools: [...AGENT_TOOLS],
  allowedTools: [...AGENT_PERMISSION_RULES],
  // "Don't prompt for permissions, deny if not pre-approved"
  permissionMode: "dontAsk",
  cwd: params.workspaceDir,
  env: buildSubprocessEnv(params),
  // Isolates the run from this repo's CLAUDE.md and the operator's own
  // Claude Code settings/hooks, neither of which the agent under eval should see.
  settingSources: [],
  maxTurns: params.maxTurns,
  abortController,
  persistSession: false,
  stderr: (data) => stderrChunks.push(data),
  hooks: {
    PreToolUse: [
      {
        hooks: [
          createToolGuardHook({
            workspaceDir: params.workspaceDir,
            mapiKey: params.mapiKey,
          }),
        ],
      },
    ],
  },
});

// An explicit allowlist, never a spread of process.env, so the harness' own
// credentials (KONTENT_*, E2E_*, EVALS_SOURCE_ENV_ID, ANTHROPIC_*) never
// reach the agent under eval.
const buildSubprocessEnv = (params: RunTaskAgentParams): Record<string, string | undefined> => ({
  PATH: `${params.cliBinDir}:${process.env.PATH ?? ""}`,
  HOME: process.env.HOME,
  // Keys the macOS Keychain lookup for the stored login.
  USER: process.env.USER,
  // Where the CLI and node put temp files.
  TMPDIR: process.env.TMPDIR,
  // Locale; keeps tool output UTF-8.
  LANG: process.env.LANG,
  // Terminal type; chalk and the claude binary read it.
  TERM: process.env.TERM,
  EVALS_MAPI_KEY: params.mapiKey,
  // Read by the `kontent` shim to append its per-invocation record; see
  // evals/globalSetup.ts and evals/lib/invocations.ts.
  EVALS_INVOCATION_LOG: params.invocationLogPath,
});

const createToolGuardHook =
  (policy: ToolPolicy): HookCallback =>
  async (input) =>
    input.hook_event_name === "PreToolUse"
      ? toHookOutput(
          applyToolPolicy(policy, { toolName: input.tool_name, input: input.tool_input }),
        )
      : {};

const toHookOutput = (verdict: Result<void, string>): Awaited<ReturnType<HookCallback>> =>
  isErr(verdict)
    ? {
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: verdict.error,
        },
      }
    : {};

const deriveStopReason = (messages: ReadonlyArray<SDKMessage>): AgentRun["stopReason"] => {
  const result = findResultMessage(messages);
  if (result === undefined) {
    return "error";
  }
  if (result.subtype === "success") {
    return "completed";
  }
  if (result.subtype === "error_max_turns") {
    return "max_turns";
  }
  return "error";
};
