import { readFile } from "node:fs/promises";
import { join } from "node:path";
import * as z from "zod/mini";
import { err, fromThrowable, isErr, ok, type Result, tryAsync } from "../../src/core/lib/result.js";
import { describeCause, describeList } from "./inspect.js";
import { type CliInvocation, isHelpLookup } from "./invocations.js";
import type { Assertion, EvalCheckContext } from "./types.js";

export const ANSWER_FILE = "answer.json";

// The outer err is a harness failure; the inner err is an answer the agent did not deliver.
export const readAnswer = async <T>(
  workspaceDir: string,
  schema: z.ZodMiniType<T>,
): Promise<Result<Result<T, string>, string>> => {
  const raw = await tryAsync(
    () => readFile(join(workspaceDir, ANSWER_FILE), "utf8"),
    (cause) => cause,
  );
  if (isErr(raw)) {
    return (raw.error as NodeJS.ErrnoException).code === "ENOENT"
      ? ok(err(`${ANSWER_FILE} was not written`))
      : err(`Reading ${ANSWER_FILE} failed: ${describeCause(raw.error)}`);
  }

  const json = fromThrowable((): unknown => JSON.parse(raw.value), describeCause);
  if (isErr(json)) {
    return ok(err(`${ANSWER_FILE} is not valid JSON: ${json.error}`));
  }

  const parsed = z.safeParse(schema, json.value);
  return ok(
    parsed.success
      ? ok(parsed.data)
      : err(`${ANSWER_FILE} is not the requested shape: ${describeIssues(parsed.error)}`),
  );
};

// Deliberately strict: the same answers are reachable through `kontent mapi`, but these tasks
// measure whether an agent finds the Delivery API unaided.
export const readThroughDapi = (invocations: ReadonlyArray<CliInvocation>): Assertion => {
  const dapiInvocations = invocations.filter(
    (invocation) => invocation.args[0] === "dapi" && !isHelpLookup(invocation),
  );
  return {
    id: "read-through-dapi",
    passed: dapiInvocations.some((invocation) => invocation.exitCode === 0),
    evidence: `dapi requests: ${dapiInvocations.length}; ${describeList(
      dapiInvocations.map(
        (invocation) => `[exit ${invocation.exitCode}] ${invocation.args.join(" ")}`,
      ),
    )}`,
  };
};

const TitlesAnswerSchema = z.object({ titles: z.array(z.string()) });

export const gradeTitlesAnswer = async (
  assertionId: string,
  expectedTitles: ReadonlyArray<string>,
  { workspaceDir, invocations }: EvalCheckContext,
): Promise<Result<ReadonlyArray<Assertion>, string>> => {
  const answerResult = await readAnswer(workspaceDir, TitlesAnswerSchema);
  if (isErr(answerResult)) {
    return answerResult;
  }
  const answer = answerResult.value;
  const dapiAssertion = readThroughDapi(invocations);

  if (isErr(answer)) {
    return ok([
      { id: "answer-file-valid", passed: false, evidence: answer.error },
      { id: assertionId, passed: false, evidence: "no answer to inspect" },
      dapiAssertion,
    ]);
  }

  const { titles } = answer.value;
  const missing = expectedTitles.filter((title) => !titles.includes(title));
  const unexpected = titles.filter((title) => !expectedTitles.includes(title));
  return ok([
    { id: "answer-file-valid", passed: true, evidence: `${ANSWER_FILE} parsed` },
    {
      id: assertionId,
      passed:
        missing.length === 0 && unexpected.length === 0 && titles.length === expectedTitles.length,
      evidence: `titles: ${describeList(titles)}; missing: ${describeList(missing)}; unexpected: ${describeList(unexpected)}`,
    },
    dapiAssertion,
  ]);
};

const describeIssues = (error: z.core.$ZodError): string =>
  error.issues.map((issue) => issue.message).join("; ");
