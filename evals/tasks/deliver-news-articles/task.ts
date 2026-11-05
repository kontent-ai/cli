import { ANSWER_FILE, gradeTitlesAnswer } from "../../lib/delivery.js";
import type { EvalTask } from "../../lib/types.js";
import { CUSTOMER_STORIES, storyName } from "../publish-customer-stories/task.js";
import { NEW_TITLE } from "../update-language-variant/task.js";

const NEWS_TITLES = [
  NEW_TITLE,
  ...CUSTOMER_STORIES.filter((story) => story.topics.includes("news")).map((story) =>
    storyName(story.company),
  ),
];

export const deliverNewsArticles: EvalTask = {
  id: "deliver-news-articles",
  dependsOn: ["publish-customer-stories"],
  prompt: `Which articles on our live site are tagged News? Save their titles to ${ANSWER_FILE} as { "titles": [...] }.`,
  check: (_client, context) => gradeTitlesAnswer("titles-are-news-only", NEWS_TITLES, context),
};
