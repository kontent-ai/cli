import { contentTypeWithSnippet } from "../tasks/content-type-with-snippet/task.js";
import { deliverArticle } from "../tasks/deliver-article/task.js";
import { deliverNewsArticles } from "../tasks/deliver-news-articles/task.js";
import { deliverUsedIn } from "../tasks/deliver-used-in/task.js";
import { draftSummary } from "../tasks/draft-summary/task.js";
import { publishCustomerStories } from "../tasks/publish-customer-stories/task.js";
import { publishItem } from "../tasks/publish-item/task.js";
import { schedulePublish } from "../tasks/schedule-publish/task.js";
import { taxonomyGroup } from "../tasks/taxonomy-group/task.js";
import { updateContentType } from "../tasks/update-content-type/task.js";
import { updateLanguageVariant } from "../tasks/update-language-variant/task.js";
import { workflowAndCollection } from "../tasks/workflow-and-collection/task.js";
import type { EvalTask } from "./types.js";

export const evalTasks: ReadonlyArray<EvalTask> = [
  taxonomyGroup,
  workflowAndCollection,
  contentTypeWithSnippet,
  publishItem,
  schedulePublish,
  updateLanguageVariant,
  updateContentType,
  draftSummary,
  deliverArticle,
  publishCustomerStories,
  deliverNewsArticles,
  deliverUsedIn,
];
