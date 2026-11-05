import * as z from "zod/mini";
import { isErr, ok } from "../../../src/core/lib/result.js";
import { ANSWER_FILE, readAnswer, readThroughDapi } from "../../lib/delivery.js";
import { describeList } from "../../lib/inspect.js";
import type { Assertion, EvalTask } from "../../lib/types.js";
import { DRAFT_SUMMARY } from "../draft-summary/task.js";
import { NEW_SUMMARY, NEW_TITLE } from "../update-language-variant/task.js";

const AnswerSchema = z.object({
  title: z.string(),
  summary: z.string(),
  topics: z.array(z.string()),
});

export const deliverArticle: EvalTask = {
  id: "deliver-article",
  dependsOn: ["draft-summary"],
  prompt: `What does our live website currently show for the "Launch announcement" article? Save it to ${ANSWER_FILE} as { "title", "summary", "topics": [term codenames] }.`,
  check: async (_client, { workspaceDir, invocations }) => {
    const answerResult = await readAnswer(workspaceDir, AnswerSchema);
    if (isErr(answerResult)) {
      return answerResult;
    }
    const answer = answerResult.value;
    const dapiAssertion = readThroughDapi(invocations);

    if (isErr(answer)) {
      const noAnswer = (id: string): Assertion => ({
        id,
        passed: false,
        evidence: "no answer to inspect",
      });
      return ok([
        { id: "answer-file-valid", passed: false, evidence: answer.error },
        noAnswer("title-is-published"),
        noAnswer("summary-is-published"),
        noAnswer("topics-have-product-and-news"),
        dapiAssertion,
      ]);
    }

    const { title, summary, topics } = answer.value;
    return ok([
      { id: "answer-file-valid", passed: true, evidence: `${ANSWER_FILE} parsed` },
      { id: "title-is-published", passed: title === NEW_TITLE, evidence: `title: ${title}` },
      {
        id: "summary-is-published",
        passed: summary === NEW_SUMMARY,
        evidence:
          summary === DRAFT_SUMMARY
            ? `summary: ${summary} (matches the unpublished draft instead of the published text)`
            : `summary: ${summary}`,
      },
      {
        id: "topics-have-product-and-news",
        passed: ["product", "news"].every((codename) => topics.includes(codename)),
        evidence: `topics: ${describeList(topics)}`,
      },
      dapiAssertion,
    ]);
  },
};
