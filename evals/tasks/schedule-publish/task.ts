import { isSome } from "../../../src/lib/option.js";
import { isErr, ok } from "../../../src/lib/result.js";
import { DEFAULT_CODENAME, SCHEDULED_STEP_CODENAME } from "../../lib/codenames.js";
import {
  describeList,
  describeVariantStep,
  findElementByCodename,
  findItemsByName,
  isVariantInStep,
  lookup,
  lookupByCodename,
  missingAssertion,
} from "../../lib/inspect.js";
import type { EvalTask } from "../../lib/types.js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_HOUR = 60 * 60 * 1000;

export const schedulePublish: EvalTask = {
  id: "schedule-publish",
  dependsOn: ["content-type-with-snippet"],
  prompt:
    'Write an article called "Winter release notes" and schedule it to go live in two weeks at 9:00 UTC.',
  check: async (client) => {
    const items = await lookup("Listing content items", () =>
      client.listContentItems().toAllPromise(),
    );
    if (isErr(items)) {
      return items;
    }

    const article = findItemsByName(items.value.data.items, "winter release notes")[0];
    if (article === undefined) {
      return ok([
        missingAssertion("winter-release-notes-item-exists", "winter release notes content item"),
      ]);
    }

    const articleLookup = await lookupByCodename("article content type", () =>
      client.viewContentType().byTypeCodename("article").toPromise(),
    );
    if (isErr(articleLookup)) {
      return articleLookup;
    }
    const articleType = isSome(articleLookup.value) ? articleLookup.value.value.data : undefined;

    const variantLookup = await lookupByCodename("winter release notes language variant", () =>
      client
        .viewLanguageVariant()
        .byItemId(article.id)
        .byLanguageCodename(DEFAULT_CODENAME)
        .toPromise(),
    );
    if (isErr(variantLookup)) {
      return variantLookup;
    }
    const variant = isSome(variantLookup.value) ? variantLookup.value.value.data : undefined;

    const workflows = await lookup("Listing workflows", () => client.listWorkflows().toPromise());
    if (isErr(workflows)) {
      return workflows;
    }

    const publishTime = variant?.schedule.publishTime ?? null;
    const actualTime = publishTime === null ? null : Date.parse(publishTime);
    // A run near midnight UTC can land "two weeks from today" on the day before
    // or after, so any of the three candidate days is accepted.
    const expectedTimes = [-1, 0, 1].map((dayOffset) => expectedPublishTime(dayOffset));

    return ok([
      {
        id: "winter-release-notes-item-exists",
        passed: true,
        evidence: `${article.name} [${article.codename}]`,
      },
      {
        id: "publish-scheduled-for-the-requested-time",
        passed: actualTime !== null && expectedTimes.includes(actualTime),
        evidence: `schedule.publishTime: ${publishTime ?? "not set"}; expected one of: ${describeList(
          expectedTimes.map((time) => new Date(time).toISOString()),
        )}`,
      },
      {
        id: "variant-waits-in-the-scheduled-step",
        passed:
          variant !== undefined &&
          isVariantInStep(variant, workflows.value.data, SCHEDULED_STEP_CODENAME),
        evidence:
          variant === undefined
            ? "the article has no language variant"
            : `workflow step: ${describeVariantStep(variant, workflows.value.data)}`,
      },
      {
        id: "article-type-intact",
        passed:
          articleType !== undefined &&
          findElementByCodename(articleType.elements, "title") !== undefined &&
          articleType.elements.some((element) => element.type === "snippet"),
        evidence:
          articleType === undefined
            ? "article content type not found"
            : `article elements: ${describeList(articleType.elements.map((element) => element.codename ?? "?"))}`,
      },
    ]);
  },
};

const expectedPublishTime = (dayOffset: number): number => {
  const now = new Date();
  const todayMidnightUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return todayMidnightUtc + (14 + dayOffset) * MS_PER_DAY + 9 * MS_PER_HOUR;
};
