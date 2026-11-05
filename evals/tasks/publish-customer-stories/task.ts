import type {
  ContentItemModels,
  ElementModels,
  LanguageVariantModels,
} from "@kontent-ai/management-sdk";
import type { MapiClient } from "../../../src/cli/adapters/mapi/client.js";
import { isSome } from "../../../src/core/lib/option.js";
import { isErr, ok, type Result } from "../../../src/core/lib/result.js";
import { DEFAULT_CODENAME, PUBLISHED_STEP_CODENAME } from "../../lib/codenames.js";
import {
  describeList,
  describeVariantStep,
  findItemsByName,
  flattenTaxonomyTerms,
  isVariantInStep,
  lookup,
  lookupByCodename,
} from "../../lib/inspect.js";
import type { Assertion, EvalTask } from "../../lib/types.js";

type TopicCodename = "news" | "product" | "engineering";

type CustomerStory = Readonly<{
  company: string;
  topics: ReadonlyArray<TopicCodename>;
  // Item names, as the prompt states them.
  related: ReadonlyArray<string>;
}>;

export const LAUNCH_ANNOUNCEMENT = "Launch announcement";

export const storyName = (company: string): string => `Customer story: ${company}`;

export const CUSTOMER_STORIES: ReadonlyArray<CustomerStory> = [
  { company: "Acme", topics: ["product", "news"], related: [LAUNCH_ANNOUNCEMENT] },
  { company: "Globex", topics: ["product"], related: [] },
  { company: "Initech", topics: ["news"], related: [LAUNCH_ANNOUNCEMENT] },
  { company: "Umbrella", topics: ["product", "engineering"], related: [LAUNCH_ANNOUNCEMENT] },
  { company: "Hooli", topics: ["engineering"], related: [storyName("Acme")] },
  { company: "Vandelay", topics: ["news", "engineering"], related: [] },
  {
    company: "Massive Dynamic",
    topics: ["product"],
    related: [LAUNCH_ANNOUNCEMENT, storyName("Acme")],
  },
  { company: "Weyland-Yutani", topics: ["engineering"], related: [] },
  { company: "Tyrell", topics: ["product", "news"], related: [] },
  { company: "Dunder Mifflin", topics: [], related: [storyName("Globex")] },
];

const TOPIC_LABELS: Readonly<Record<TopicCodename, string>> = {
  news: "News",
  product: "Product",
  engineering: "Engineering",
};

const describeStory = (story: CustomerStory): string => {
  const topics =
    story.topics.length === 0
      ? "no topics"
      : story.topics.map((codename) => TOPIC_LABELS[codename]).join(", ");
  const related = story.related.length === 0 ? "" : `. Related: ${story.related.join(", ")}`;
  return `- ${story.company}: ${topics}${related}`;
};

export const publishCustomerStories: EvalTask = {
  id: "publish-customer-stories",
  dependsOn: ["update-language-variant"],
  prompt: `Publish these customer stories as articles, titled "Customer story: <name>". A one-sentence body is fine.\n\n${CUSTOMER_STORIES.map(describeStory).join("\n")}`,
  check: async (client) => {
    const items = await lookup("Listing content items", () =>
      client.listContentItems().toAllPromise(),
    );
    if (isErr(items)) {
      return items;
    }
    const allItems = items.value.data.items;

    const articleLookup = await lookupByCodename("article content type", () =>
      client.viewContentType().byTypeCodename("article").toPromise(),
    );
    if (isErr(articleLookup)) {
      return articleLookup;
    }
    const articleType = isSome(articleLookup.value) ? articleLookup.value.value.data : undefined;
    const elementIdToCodename = new Map(
      (articleType?.elements ?? []).map((element) => [element.id, element.codename] as const),
    );

    const taxonomyLookup = await lookupByCodename("topics taxonomy", () =>
      client.getTaxonomy().byTaxonomyCodename("topics").toPromise(),
    );
    if (isErr(taxonomyLookup)) {
      return taxonomyLookup;
    }
    const termIdToCodename = new Map(
      (isSome(taxonomyLookup.value)
        ? flattenTaxonomyTerms(taxonomyLookup.value.value.data.terms)
        : []
      ).map((term) => [term.id, term.codename] as const),
    );

    const workflows = await lookup("Listing workflows", () => client.listWorkflows().toPromise());
    if (isErr(workflows)) {
      return workflows;
    }

    const statesResult = await collectStoryStates(client, allItems);
    if (isErr(statesResult)) {
      return statesResult;
    }
    const states = statesResult.value;

    const elementValue = (
      variant: LanguageVariantModels.ContentItemLanguageVariant | undefined,
      codename: string,
    ): ElementModels.ContentItemElement["value"] | undefined =>
      variant?.elements.find(
        (element) =>
          (element.element.codename ?? elementIdToCodename.get(element.element.id)) === codename,
      )?.value;
    const referencesOf = (
      variant: LanguageVariantModels.ContentItemLanguageVariant | undefined,
      codename: string,
    ): ReadonlyArray<Readonly<{ id?: string; codename?: string }>> => {
      const value = elementValue(variant, codename);
      return Array.isArray(value) ? value : [];
    };
    const itemOf = (
      reference: Readonly<{ id?: string; codename?: string }>,
    ): ContentItemModels.ContentItem | undefined =>
      allItems.find((item) => item.id === reference.id || item.codename === reference.codename);

    const existOnce = storyAssertion("stories-exist-once", states, (state) =>
      state.matches.length === 1 ? undefined : `${state.matches.length} matching items`,
    );
    const areArticles = storyAssertion("stories-are-articles", states, (state) =>
      articleType !== undefined && state.item?.type.id === articleType.id
        ? undefined
        : "not an article",
    );
    const titlesSet = storyAssertion("stories-titles-set", states, (state) => {
      const title = elementValue(state.variant, "title");
      return title === storyName(state.story.company) ? undefined : `title: ${String(title)}`;
    });
    const published = storyAssertion("stories-published", states, (state) => {
      if (state.variant === undefined) {
        return "no language variant";
      }
      return isVariantInStep(state.variant, workflows.value.data, PUBLISHED_STEP_CODENAME)
        ? undefined
        : `workflow step: ${describeVariantStep(state.variant, workflows.value.data)}`;
    });
    const topicsMatch = storyAssertion("stories-topics-match", states, (state) => {
      const topics = referencesOf(state.variant, "topics").map(
        (reference) => reference.codename ?? termIdToCodename.get(reference.id ?? "") ?? "?",
      );
      return isSameSet(topics, state.story.topics) ? undefined : `topics: ${describeList(topics)}`;
    });
    const relatedMatch = storyAssertion("stories-related-match", states, (state) => {
      const relatedIds = referencesOf(state.variant, "related").map(
        (reference) => itemOf(reference)?.id ?? reference.id ?? "?",
      );
      const expectedIds = state.story.related.map(
        (name) => findItemsByName(allItems, name)[0]?.id ?? `missing ${name}`,
      );
      return isSameSet(relatedIds, expectedIds)
        ? undefined
        : `related: ${describeList(
            referencesOf(state.variant, "related").map(
              (reference) => itemOf(reference)?.name ?? reference.id ?? "?",
            ),
          )}`;
    });

    const launchMatches = findItemsByName(allItems, LAUNCH_ANNOUNCEMENT);
    return ok([
      existOnce,
      areArticles,
      titlesSet,
      published,
      topicsMatch,
      relatedMatch,
      {
        id: "launch-announcement-not-duplicated",
        passed: launchMatches.length === 1,
        evidence: `items matching "${LAUNCH_ANNOUNCEMENT}": ${describeList(
          launchMatches.map((item) => `${item.name} [${item.codename}]`),
        )}`,
      },
    ]);
  },
};

type StoryState = Readonly<{
  story: CustomerStory;
  matches: ReadonlyArray<ContentItemModels.ContentItem>;
  item: ContentItemModels.ContentItem | undefined;
  variant: LanguageVariantModels.ContentItemLanguageVariant | undefined;
}>;

const collectStoryStates = async (
  client: MapiClient,
  allItems: ReadonlyArray<ContentItemModels.ContentItem>,
): Promise<Result<ReadonlyArray<StoryState>, string>> => {
  const results = await Promise.all(
    CUSTOMER_STORIES.map(async (story): Promise<Result<StoryState, string>> => {
      const matches = findItemsByName(allItems, storyName(story.company));
      const item = matches.length === 1 ? matches[0] : undefined;
      if (item === undefined) {
        return ok({ story, matches, item, variant: undefined });
      }

      const variantLookup = await lookupByCodename(`${item.name} language variant`, () =>
        client
          .viewLanguageVariant()
          .byItemId(item.id)
          .byLanguageCodename(DEFAULT_CODENAME)
          .toPromise(),
      );
      if (isErr(variantLookup)) {
        return variantLookup;
      }
      const variant = isSome(variantLookup.value) ? variantLookup.value.value.data : undefined;
      return ok({ story, matches, item, variant });
    }),
  );

  const failure = results.find(isErr);
  if (failure !== undefined) {
    return failure;
  }
  return ok(results.flatMap((result) => (isErr(result) ? [] : [result.value])));
};

// `describeFailure` returns undefined for a story that passes.
const storyAssertion = (
  id: string,
  states: ReadonlyArray<StoryState>,
  describeFailure: (state: StoryState) => string | undefined,
): Assertion => {
  const failures = states.flatMap((state) => {
    const failure = describeFailure(state);
    return failure === undefined ? [] : [`${storyName(state.story.company)}: ${failure}`];
  });
  return {
    id,
    passed: failures.length === 0,
    evidence: failures.length === 0 ? `all ${states.length} stories match` : failures.join("; "),
  };
};

const isSameSet = (actual: ReadonlyArray<string>, expected: ReadonlyArray<string>): boolean =>
  actual.length === expected.length && expected.every((value) => actual.includes(value));
