import type { MapiClient } from "../../src/lib/mapi/client.js";
import type { Result } from "../../src/lib/result.js";

export type Assertion = Readonly<{
  id: string;
  passed: boolean;
  evidence: string;
}>;

// BLOCKED: a dependency did not PASS, so the task never ran. ERROR: the agent
// or the check itself failed (an err Result), which is a harness problem, not
// a grading outcome.
export type Verdict = "PASS" | "FAIL" | "BLOCKED" | "ERROR";

// A failed lookup is an err: only the state of the environment decides whether
// an assertion passed, never the harness' own ability to read it.
export type EvalCheck = (client: MapiClient) => Promise<Result<ReadonlyArray<Assertion>, string>>;

export type TaskId =
  | "taxonomy-group"
  | "content-type-with-snippet"
  | "workflow-and-collection"
  | "publish-item"
  | "schedule-publish"
  | "update-language-variant"
  | "update-content-type";

export type EvalTask = Readonly<{
  id: TaskId;
  dependsOn: ReadonlyArray<TaskId>;
  prompt: string;
  check: EvalCheck;
}>;
