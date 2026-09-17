import { isNone, isSome } from "../../../src/lib/option.js";
import { isErr, ok } from "../../../src/lib/result.js";
import {
  describeList,
  findElementByCodename,
  findSnippetElementByCodename,
  lookupByCodename,
  missingAssertion,
} from "../../lib/inspect.js";
import type { EvalTask } from "../../lib/types.js";

export const contentTypeWithSnippet: EvalTask = {
  id: "content-type-with-snippet",
  dependsOn: ["taxonomy-group"],
  prompt:
    "We're starting a blog. I need an Article content type, codename article, with these elements: Title (text, codename title, required), Body (rich text, codename body, no tables or images in it for now), Author (text, codename author), Summary (text, codename summary, at most 160 characters), URL slug (codename url_slug, generated from the title), Hero image (asset, codename hero_image, one file at most), Related articles (linked items, codename related, only Articles allowed), Topics (taxonomy, codename topics, using our Topics taxonomy group) and Publish date (date and time, codename publish_date). We'll want the same SEO fields on other types later, so make Meta title and Meta description a reusable snippet, codename seo, with elements meta_title and meta_description, and put it on Article too.",
  check: async (client) => {
    const articleLookup = await lookupByCodename("article content type", () =>
      client.viewContentType().byTypeCodename("article").toPromise(),
    );
    if (isErr(articleLookup)) {
      return articleLookup;
    }
    if (isNone(articleLookup.value)) {
      return ok([missingAssertion("article-type-exists", "article content type")]);
    }

    const articleType = articleLookup.value.value.data;
    const elements = articleType.elements;

    const snippetLookup = await lookupByCodename("seo content type snippet", () =>
      client.viewContentTypeSnippet().byTypeCodename("seo").toPromise(),
    );
    if (isErr(snippetLookup)) {
      return snippetLookup;
    }
    const seoSnippet = isSome(snippetLookup.value) ? snippetLookup.value.value.data : undefined;

    const taxonomyLookup = await lookupByCodename("topics taxonomy", () =>
      client.getTaxonomy().byTaxonomyCodename("topics").toPromise(),
    );
    if (isErr(taxonomyLookup)) {
      return taxonomyLookup;
    }
    const topicsTaxonomy = isSome(taxonomyLookup.value)
      ? taxonomyLookup.value.value.data
      : undefined;

    const title = findElementByCodename(elements, "title");
    const body = findElementByCodename(elements, "body");
    const author = findElementByCodename(elements, "author");
    const summary = findElementByCodename(elements, "summary");
    const urlSlug = findElementByCodename(elements, "url_slug");
    const heroImage = findElementByCodename(elements, "hero_image");
    const related = findElementByCodename(elements, "related");
    const topics = findElementByCodename(elements, "topics");
    const publishDate = findElementByCodename(elements, "publish_date");
    const snippetElement = elements.find(
      (element) =>
        element.type === "snippet" &&
        (element.snippet.codename === "seo" ||
          (seoSnippet !== undefined && element.snippet.id === seoSnippet.id)),
    );

    return ok([
      {
        id: "article-type-exists",
        passed: true,
        evidence: `article [${articleType.codename}] elements: ${describeList(elements.map((element) => element.codename ?? "?"))}`,
      },
      {
        id: "title-required-text",
        passed: title !== undefined && title.type === "text" && title.is_required === true,
        evidence:
          title === undefined
            ? "title element not found"
            : `title: type=${title.type} is_required=${title.type === "text" ? title.is_required : "n/a"}`,
      },
      {
        id: "body-text-only",
        passed:
          body !== undefined &&
          body.type === "rich_text" &&
          (body.allowed_blocks ?? []).includes("text") &&
          !(body.allowed_blocks ?? []).includes("tables") &&
          !(body.allowed_blocks ?? []).includes("images"),
        evidence:
          body === undefined
            ? "body element not found"
            : `body: type=${body.type} allowed_blocks=${describeList(body.type === "rich_text" ? (body.allowed_blocks ?? []) : [])}`,
      },
      {
        id: "author-text",
        passed: author !== undefined && author.type === "text",
        evidence: author === undefined ? "author element not found" : `author: type=${author.type}`,
      },
      {
        id: "summary-limit-160",
        passed:
          summary !== undefined &&
          summary.type === "text" &&
          summary.maximum_text_length?.value === 160 &&
          summary.maximum_text_length.applies_to === "characters",
        evidence:
          summary === undefined
            ? "summary element not found"
            : `summary: type=${summary.type} maximum_text_length=${summary.type === "text" ? describeMaxLength(summary.maximum_text_length ?? null) : "n/a"}`,
      },
      {
        id: "url-slug-depends-on-title",
        passed:
          urlSlug !== undefined &&
          urlSlug.type === "url_slug" &&
          title !== undefined &&
          (urlSlug.depends_on.element.codename === "title" ||
            urlSlug.depends_on.element.id === title.id),
        evidence:
          urlSlug === undefined
            ? "url_slug element not found"
            : `url_slug depends_on.element: ${urlSlug.type === "url_slug" ? JSON.stringify(urlSlug.depends_on.element) : "n/a"}`,
      },
      {
        id: "hero-image-single-asset",
        passed:
          heroImage !== undefined &&
          heroImage.type === "asset" &&
          heroImage.asset_count_limit?.value === 1 &&
          heroImage.asset_count_limit.condition === "at_most",
        evidence:
          heroImage === undefined
            ? "hero_image element not found"
            : `hero_image asset_count_limit: ${heroImage.type === "asset" ? describeCountLimit(heroImage.asset_count_limit ?? null) : "n/a"}`,
      },
      {
        id: "related-only-articles",
        passed:
          related !== undefined &&
          related.type === "modular_content" &&
          (related.allowed_content_types ?? []).length === 1 &&
          (related.allowed_content_types ?? []).some(
            (reference) =>
              reference.id === articleType.id || reference.codename === articleType.codename,
          ),
        evidence:
          related === undefined
            ? "related element not found"
            : `related allowed_content_types: ${related.type === "modular_content" ? JSON.stringify(related.allowed_content_types ?? []) : "n/a"}`,
      },
      {
        id: "topics-taxonomy-element",
        passed:
          topics !== undefined &&
          topics.type === "taxonomy" &&
          (topics.taxonomy_group.codename === "topics" ||
            (topicsTaxonomy !== undefined && topics.taxonomy_group.id === topicsTaxonomy.id)),
        evidence:
          topics === undefined
            ? "topics element not found"
            : `topics taxonomy_group: ${topics.type === "taxonomy" ? JSON.stringify(topics.taxonomy_group) : "n/a"}; topics taxonomy: ${topicsTaxonomy === undefined ? "not found" : topicsTaxonomy.id}`,
      },
      {
        id: "publish-date-date-time",
        passed: publishDate !== undefined && publishDate.type === "date_time",
        evidence:
          publishDate === undefined
            ? "publish_date element not found"
            : `publish_date: type=${publishDate.type}`,
      },
      {
        id: "seo-snippet-exists",
        passed:
          seoSnippet !== undefined &&
          findSnippetElementByCodename(seoSnippet, "meta_title")?.type === "text" &&
          findSnippetElementByCodename(seoSnippet, "meta_description")?.type === "text",
        evidence:
          seoSnippet === undefined
            ? "seo content type snippet not found"
            : `seo snippet elements: ${describeList(seoSnippet.elements.map((element) => `${element.codename ?? "?"} (${element.type})`))}`,
      },
      {
        id: "seo-snippet-on-article",
        passed:
          snippetElement !== undefined &&
          snippetElement.type === "snippet" &&
          seoSnippet !== undefined &&
          (snippetElement.snippet.codename === "seo" ||
            snippetElement.snippet.id === seoSnippet.id),
        evidence:
          snippetElement === undefined
            ? "article has no snippet element"
            : `article snippet reference: ${snippetElement.type === "snippet" ? JSON.stringify(snippetElement.snippet) : "n/a"}`,
      },
    ]);
  },
};

const describeMaxLength = (limit: { value: number; applies_to: string } | null): string =>
  limit === null ? "unset" : `value=${limit.value} applies_to=${limit.applies_to}`;

const describeCountLimit = (limit: { value: number; condition: string } | null): string =>
  limit === null ? "unset" : `value=${limit.value} condition=${limit.condition}`;
