import type { TaxonomyModels } from "@kontent-ai/management-sdk";
import { isNone } from "../../../src/lib/option.js";
import { isErr, ok } from "../../../src/lib/result.js";
import {
  describeList,
  flattenTaxonomyTerms,
  lookupByCodename,
  missingAssertion,
} from "../../lib/inspect.js";
import type { EvalTask } from "../../lib/types.js";

const REQUIRED_TERM_CODENAMES = ["news", "product", "engineering"] as const;

export const taxonomyGroup: EvalTask = {
  id: "taxonomy-group",
  dependsOn: [],
  prompt:
    "Create a taxonomy group called Topics, codename topics, with the terms News (codename news), Product (codename product) and Engineering (codename engineering). One of them should sit underneath another one as a sub-term.",
  check: async (client) => {
    const topicsLookup = await lookupByCodename("topics taxonomy", () =>
      client.getTaxonomy().byTaxonomyCodename("topics").toPromise(),
    );
    if (isErr(topicsLookup)) {
      return topicsLookup;
    }
    if (isNone(topicsLookup.value)) {
      return ok([missingAssertion("topics-taxonomy-exists", "topics taxonomy")]);
    }

    const topics = topicsLookup.value.value.data;
    const termCodenames = flattenTaxonomyTerms(topics.terms).map((term) => term.codename);
    const missingCodenames = REQUIRED_TERM_CODENAMES.filter(
      (codename) => !termCodenames.includes(codename),
    );
    const nestedParent = topics.terms.find((term) => term.terms.length > 0);

    return ok([
      {
        id: "topics-taxonomy-exists",
        passed: true,
        evidence: `topics [${topics.codename}] terms: ${describeTermTree(topics.terms)}`,
      },
      {
        id: "topics-has-news-product-engineering",
        passed: missingCodenames.length === 0,
        evidence: `term codenames: ${describeList(termCodenames)}; missing: ${describeList(missingCodenames)}`,
      },
      {
        id: "topics-has-a-nested-term",
        passed: nestedParent !== undefined,
        evidence:
          nestedParent === undefined
            ? `no term has sub-terms: ${describeTermTree(topics.terms)}`
            : `${nestedParent.codename} contains ${describeList(nestedParent.terms.map((term) => term.codename))}`,
      },
    ]);
  },
};

const describeTermTree = (terms: ReadonlyArray<TaxonomyModels.Taxonomy>): string =>
  describeList(
    terms.map((term) =>
      term.terms.length === 0
        ? term.codename
        : `${term.codename} > (${describeTermTree(term.terms)})`,
    ),
  );
