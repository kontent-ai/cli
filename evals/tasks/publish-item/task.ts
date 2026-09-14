import { isSome } from "../../../src/lib/option.js";
import { isErr, ok } from "../../../src/lib/result.js";
import { DEFAULT_CODENAME, PUBLISHED_STEP_CODENAME } from "../../lib/codenames.js";
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

export const publishItem: EvalTask = {
  id: "publish-item",
  dependsOn: ["content-type-with-snippet", "workflow-and-collection"],
  prompt:
    'Write an article called "Launch announcement" and publish it. It belongs in the Blog collection.',
  check: async (client) => {
    const items = await lookup("Listing content items", () =>
      client.listContentItems().toAllPromise(),
    );
    if (isErr(items)) {
      return items;
    }

    const article = findItemsByName(items.value.data.items, "launch announcement")[0];
    if (article === undefined) {
      return ok([
        missingAssertion("launch-announcement-item-exists", "launch announcement content item"),
      ]);
    }

    const articleLookup = await lookupByCodename("article content type", () =>
      client.viewContentType().byTypeCodename("article").toPromise(),
    );
    if (isErr(articleLookup)) {
      return articleLookup;
    }
    const articleType = isSome(articleLookup.value) ? articleLookup.value.value.data : undefined;

    const collections = await lookup("Listing collections", () =>
      client.listCollections().toPromise(),
    );
    if (isErr(collections)) {
      return collections;
    }
    const blogCollection = collections.value.data.collections.find(
      (collection) => collection.codename === "blog",
    );

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

    const workflows = await lookup("Listing workflows", () => client.listWorkflows().toPromise());
    if (isErr(workflows)) {
      return workflows;
    }

    return ok([
      {
        id: "launch-announcement-item-exists",
        passed: true,
        evidence: `${article.name} [${article.codename}]`,
      },
      {
        id: "launch-announcement-is-an-article",
        passed: articleType !== undefined && article.type.id === articleType.id,
        evidence: `item type id: ${article.type.id}; article content type id: ${articleType?.id ?? "not found"}`,
      },
      {
        id: "launch-announcement-published",
        passed:
          variant !== undefined &&
          isVariantInStep(variant, workflows.value.data, PUBLISHED_STEP_CODENAME),
        evidence:
          variant === undefined
            ? "the article has no language variant"
            : `workflow step: ${describeVariantStep(variant, workflows.value.data)}`,
      },
      {
        id: "launch-announcement-in-blog-collection",
        passed: blogCollection !== undefined && article.collection.id === blogCollection.id,
        evidence: `article collection id: ${article.collection.id}; blog collection: ${
          blogCollection === undefined
            ? "not found"
            : `${blogCollection.codename} [${blogCollection.id}]`
        }`,
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
