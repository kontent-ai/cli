import type { ElementModels } from "@kontent-ai/management-sdk";
import { isSome } from "../../../src/core/lib/option.js";
import { isErr, ok } from "../../../src/core/lib/result.js";
import { DEFAULT_CODENAME, PUBLISHED_STEP_CODENAME } from "../../lib/codenames.js";
import {
  describeList,
  describeVariantStep,
  findItemsByName,
  isVariantInStep,
  lookup,
  lookupByCodename,
} from "../../lib/inspect.js";
import type { Assertion, EvalTask } from "../../lib/types.js";
import { NEW_SUMMARY, NEW_TITLE } from "../update-language-variant/task.js";

export const DRAFT_SUMMARY = "Coming soon: the 2026 roadmap.";

export const draftSummary: EvalTask = {
  id: "draft-summary",
  dependsOn: ["update-language-variant"],
  prompt: `Start a new draft of "Launch announcement" with the summary "${DRAFT_SUMMARY}" Do not publish it.`,
  check: async (client) => {
    const items = await lookup("Listing content items", () =>
      client.listContentItems().toAllPromise(),
    );
    if (isErr(items)) {
      return items;
    }

    const matches = findItemsByName(items.value.data.items, "launch announcement");
    const noDuplicate: Assertion = {
      id: "article-not-duplicated",
      passed: matches.length === 1,
      evidence: `items matching "launch announcement": ${describeList(
        matches.map((item) => `${item.name} [${item.codename}]`),
      )}`,
    };

    const article = matches[0];
    const noArticle = (id: string): Assertion => ({
      id,
      passed: false,
      evidence: "no matching article to inspect",
    });
    if (article === undefined) {
      return ok([
        noDuplicate,
        noArticle("draft-summary-set"),
        noArticle("latest-version-not-published"),
        noArticle("published-version-kept"),
        noArticle("title-unchanged"),
        noArticle("article-type-intact"),
      ]);
    }

    const articleLookup = await lookupByCodename("article content type", () =>
      client.viewContentType().byTypeCodename("article").toPromise(),
    );
    if (isErr(articleLookup)) {
      return articleLookup;
    }
    const articleElements = isSome(articleLookup.value)
      ? articleLookup.value.value.data.elements
      : undefined;
    const idToCodename = new Map(
      (articleElements ?? []).map((element) => [element.id, element.codename] as const),
    );
    const articleTypeIntact: Assertion =
      articleElements === undefined
        ? { id: "article-type-intact", passed: false, evidence: "article content type not found" }
        : {
            id: "article-type-intact",
            passed:
              articleElements.some((element) => element.codename === "title") &&
              articleElements.some((element) => element.type === "snippet"),
            evidence: `article element codenames: ${describeList(
              articleElements.map((element) => element.codename ?? "?"),
            )}`,
          };

    const variantLookup = await lookupByCodename("launch announcement language variant", () =>
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

    const publishedLookup = await lookupByCodename("launch announcement published version", () =>
      client
        .viewLanguageVariant()
        .byItemId(article.id)
        .byLanguageCodename(DEFAULT_CODENAME)
        .published()
        .toPromise(),
    );
    if (isErr(publishedLookup)) {
      return publishedLookup;
    }
    const publishedVariant = isSome(publishedLookup.value)
      ? publishedLookup.value.value.data
      : undefined;

    const workflows = await lookup("Listing workflows", () => client.listWorkflows().toPromise());
    if (isErr(workflows)) {
      return workflows;
    }

    const stringValueOf = (
      elements: ReadonlyArray<ElementModels.ContentItemElement> | undefined,
      codename: string,
    ): string | undefined => {
      const value = elements?.find(
        (element) =>
          (element.element.codename ?? idToCodename.get(element.element.id)) === codename,
      )?.value;
      return typeof value === "string" ? value : undefined;
    };
    const summaryValue = stringValueOf(variant?.elements, "summary");
    const titleValue = stringValueOf(variant?.elements, "title");
    const publishedSummary = stringValueOf(publishedVariant?.elements, "summary");

    return ok([
      noDuplicate,
      {
        id: "draft-summary-set",
        passed: summaryValue === DRAFT_SUMMARY,
        evidence: `latest summary: ${summaryValue ?? "not set"}`,
      },
      {
        id: "latest-version-not-published",
        passed:
          variant !== undefined &&
          !isVariantInStep(variant, workflows.value.data, PUBLISHED_STEP_CODENAME),
        evidence:
          variant === undefined
            ? "the article has no language variant"
            : `workflow step: ${describeVariantStep(variant, workflows.value.data)}`,
      },
      {
        id: "published-version-kept",
        passed: publishedSummary === NEW_SUMMARY,
        evidence:
          publishedVariant === undefined
            ? "the article has no published version"
            : `published summary: ${publishedSummary ?? "not set"}`,
      },
      {
        id: "title-unchanged",
        passed: titleValue === NEW_TITLE,
        evidence: `title: ${titleValue ?? "not set"}`,
      },
      articleTypeIntact,
    ]);
  },
};
