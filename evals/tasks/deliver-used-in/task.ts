import { ANSWER_FILE, gradeTitlesAnswer } from "../../lib/delivery.js";
import type { EvalTask } from "../../lib/types.js";
import {
  CUSTOMER_STORIES,
  LAUNCH_ANNOUNCEMENT,
  storyName,
} from "../publish-customer-stories/task.js";

const REFERRER_TITLES = CUSTOMER_STORIES.filter((story) =>
  story.related.includes(LAUNCH_ANNOUNCEMENT),
).map((story) => storyName(story.company));

export const deliverUsedIn: EvalTask = {
  id: "deliver-used-in",
  dependsOn: ["publish-customer-stories"],
  prompt: `We're thinking of retiring "${LAUNCH_ANNOUNCEMENT}". Which pages on our live site link to it? Save their titles to ${ANSWER_FILE} as { "titles": [...] }.`,
  check: (_client, context) => gradeTitlesAnswer("titles-are-referrers", REFERRER_TITLES, context),
};
