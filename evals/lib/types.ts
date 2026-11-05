import type { MapiClient } from "../../src/cli/adapters/mapi/client.js";
import type { Result } from "../../src/core/lib/result.js";
import type { CliInvocation } from "./invocations.js";

export type Assertion = Readonly<{
  id: string;
  passed: boolean;
  evidence: string;
}>;

// BLOCKED: a dependency did not PASS, so the task never ran. ERROR: the agent
// or the check itself failed (an err Result), which is a harness problem, not
// a grading outcome.
export type Verdict = "PASS" | "FAIL" | "BLOCKED" | "ERROR";

export type EvalCheckContext = Readonly<{
  workspaceDir: string;
  invocations: ReadonlyArray<CliInvocation>;
}>;

// A failed lookup is an err: only what the agent left behind (environment state,
// workspace files, the commands it ran) decides whether an assertion passed,
// never the harness' own ability to read it.
export type EvalCheck = (
  client: MapiClient,
  context: EvalCheckContext,
) => Promise<Result<ReadonlyArray<Assertion>, string>>;

export type TaskId =
  | "taxonomy-group"
  | "content-type-with-snippet"
  | "workflow-and-collection"
  | "publish-item"
  | "schedule-publish"
  | "update-language-variant"
  | "update-content-type"
  | "draft-summary"
  | "deliver-article"
  | "publish-customer-stories"
  | "deliver-news-articles"
  | "deliver-used-in";

export type EvalTask = Readonly<{
  id: TaskId;
  dependsOn: ReadonlyArray<TaskId>;
  prompt: string;
  check: EvalCheck;
}>;
