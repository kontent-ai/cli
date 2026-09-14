import type { ElementModels } from "@kontent-ai/management-sdk";
import { isSome } from "../../../src/lib/option.js";
import { isErr, ok } from "../../../src/lib/result.js";
import { DEFAULT_CODENAME, PUBLISHED_STEP_CODENAME } from "../../lib/codenames.js";
import {
  describeList,
  describeVariantStep,
  findItemsByName,
  flattenTaxonomyTerms,
  isVariantInStep,
  lookup,
  lookupByCodename,
  truncate,
} from "../../lib/inspect.js";
import type { Assertion, EvalTask } from "../../lib/types.js";

const NEW_TITLE = "Launch announcement 2026";
const NEW_SUMMARY = "Everything new in the 2026 release.";
// Agents render the heading's apostrophe in whatever encoding their tool chose.
const APOSTROPHE_VARIANTS = /&#39;|&apos;|’|'/g;

export const updateLanguageVariant: EvalTask = {
  id: "update-language-variant",
  dependsOn: ["publish-item", "schedule-publish"],
  prompt:
    'Update the published "Launch announcement" article. New title "Launch announcement 2026". Summary: "Everything new in the 2026 release." Body should have a heading "What\'s new", a short paragraph, and a bullet list with three items. Tag it with the Topics terms Product and News. Link "Winter release notes" as a related article. Then publish it again. Do not create a new article.',
  check: async (client) => {
    const items = await lookup("Listing content items", () =>
      client.listContentItems().toAllPromise(),
    );
    if (isErr(items)) {
      return items;
    }

    const allItems = items.value.data.items;
    const matches = findItemsByName(allItems, "launch announcement");
    const noDuplicate: Assertion = {
      id: "article-was-updated-not-duplicated",
      passed: matches.length === 1,
      evidence: `items matching "launch announcement": ${describeList(
        matches.map((item) => `${item.name} [${item.codename}]`),
      )}`,
    };

    const article = matches[0];
    if (article === undefined) {
      return ok([
        noDuplicate,
        { id: "title-updated", passed: false, evidence: "no matching article to inspect" },
        { id: "summary-updated", passed: false, evidence: "no matching article to inspect" },
        {
          id: "body-has-heading-and-list",
          passed: false,
          evidence: "no matching article to inspect",
        },
        {
          id: "topics-has-product-and-news",
          passed: false,
          evidence: "no matching article to inspect",
        },
        {
          id: "related-links-winter-release-notes",
          passed: false,
          evidence: "no matching article to inspect",
        },
        {
          id: "updated-article-published",
          passed: false,
          evidence: "no matching article to inspect",
        },
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

    const elementByCodename = (codename: string): ElementModels.ContentItemElement | undefined =>
      variant?.elements.find(
        (element) =>
          (element.element.codename ?? idToCodename.get(element.element.id)) === codename,
      );

    const taxonomyLookup = await lookupByCodename("topics taxonomy", () =>
      client.getTaxonomy().byTaxonomyCodename("topics").toPromise(),
    );
    if (isErr(taxonomyLookup)) {
      return taxonomyLookup;
    }
    const topicsTerms = isSome(taxonomyLookup.value)
      ? flattenTaxonomyTerms(taxonomyLookup.value.value.data.terms)
      : [];

    const winterReleaseNotes = findItemsByName(allItems, "winter release notes")[0];

    const workflows = await lookup("Listing workflows", () => client.listWorkflows().toPromise());
    if (isErr(workflows)) {
      return workflows;
    }

    const titleElement = elementByCodename("title");
    const titleValue = typeof titleElement?.value === "string" ? titleElement.value : undefined;

    const summaryElement = elementByCodename("summary");
    const summaryValue =
      typeof summaryElement?.value === "string" ? summaryElement.value : undefined;

    const bodyElement = elementByCodename("body");
    const bodyHtml = typeof bodyElement?.value === "string" ? bodyElement.value : "";
    const { hasHeading, listItemCount } = analyzeBody(bodyHtml);

    const topicsElement = elementByCodename("topics");
    const topicsValue =
      topicsElement !== undefined && Array.isArray(topicsElement.value) ? topicsElement.value : [];
    const productTerm = topicsTerms.find((term) => term.codename === "product");
    const newsTerm = topicsTerms.find((term) => term.codename === "news");
    const referencesTerm = (term: { id: string; codename: string } | undefined): boolean =>
      term !== undefined &&
      topicsValue.some(
        (reference) => reference.id === term.id || reference.codename === term.codename,
      );

    const relatedElement = elementByCodename("related");
    const relatedValue =
      relatedElement !== undefined && Array.isArray(relatedElement.value)
        ? relatedElement.value
        : [];
    const linksWinterReleaseNotes =
      winterReleaseNotes !== undefined &&
      relatedValue.some(
        (reference) =>
          reference.id === winterReleaseNotes.id ||
          reference.codename === winterReleaseNotes.codename,
      );

    return ok([
      noDuplicate,
      {
        id: "title-updated",
        passed: titleValue === NEW_TITLE,
        evidence: `title: ${titleValue ?? "not set"}`,
      },
      {
        id: "summary-updated",
        passed: summaryValue === NEW_SUMMARY,
        evidence: `summary: ${summaryValue ?? "not set"}`,
      },
      {
        id: "body-has-heading-and-list",
        passed: hasHeading && listItemCount === 3,
        evidence: `body (truncated): ${truncate(bodyHtml)}; list items found: ${listItemCount}`,
      },
      {
        id: "topics-has-product-and-news",
        passed: referencesTerm(productTerm) && referencesTerm(newsTerm),
        evidence: `topics element references: ${describeList(
          topicsValue.map((reference) => reference.codename ?? reference.id ?? "?"),
        )}`,
      },
      {
        id: "related-links-winter-release-notes",
        passed: linksWinterReleaseNotes,
        evidence: `related element references: ${describeList(
          relatedValue.map((reference) => reference.codename ?? reference.id ?? "?"),
        )}`,
      },
      {
        id: "updated-article-published",
        passed:
          variant !== undefined &&
          isVariantInStep(variant, workflows.value.data, PUBLISHED_STEP_CODENAME),
        evidence:
          variant === undefined
            ? "the article has no language variant"
            : `workflow step: ${describeVariantStep(variant, workflows.value.data)}`,
      },
      articleTypeIntact,
    ]);
  },
};

const analyzeBody = (html: string): { hasHeading: boolean; listItemCount: number } => {
  const headingMatches = [...html.matchAll(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/gis)];
  const hasHeading = headingMatches.some(
    (match) =>
      (match[1] ?? "")
        .replace(/<[^>]*>/g, "")
        .replace(APOSTROPHE_VARIANTS, "'")
        .trim()
        .toLowerCase() === "what's new",
  );

  const listMatch = /<ul[^>]*>([\s\S]*?)<\/ul>/i.exec(html);
  const listItemCount =
    listMatch === null ? 0 : ((listMatch[1] ?? "").match(/<li[^>]*>/gi) ?? []).length;

  return { hasHeading, listItemCount };
};
