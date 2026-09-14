import type {
  ContentItemModels,
  ContentTypeElements,
  LanguageVariantModels,
  TaxonomyModels,
  WorkflowModels,
} from "@kontent-ai/management-sdk";
import { none, type Option, some } from "../../src/lib/option.js";
import { err, ok, type Result, tryAsync } from "../../src/lib/result.js";
import { isNotFoundError } from "../../test/helpers/environment.js";
import type { Assertion } from "./types.js";

export const lookup = <T>(what: string, run: () => Promise<T>): Promise<Result<T, string>> =>
  tryAsync(run, (cause) => `${what} failed: ${describeCause(cause)}`);

// A 404 is a grading outcome (the agent did not create the thing), every other
// failure is the harness' problem.
export const lookupByCodename = async <T>(
  what: string,
  run: () => Promise<T>,
): Promise<Result<Option<T>, string>> => {
  try {
    return ok(some(await run()));
  } catch (cause) {
    return isNotFoundError(cause) ? ok(none) : err(`${what} failed: ${describeCause(cause)}`);
  }
};

export const describeCause = (cause: unknown): string => {
  if (cause instanceof Error) {
    return cause.message;
  }

  // The management SDK throws ContentManagementBaseKontentError, a plain
  // class that does not extend Error, so String(cause) would yield "[object Object]".
  return hasStringMessage(cause) ? cause.message : String(cause);
};

export const describeList = (values: ReadonlyArray<string>): string =>
  values.length === 0 ? "none" : values.join(", ");

export const missingAssertion = (id: string, what: string): Assertion => ({
  id,
  passed: false,
  evidence: `${what} not found`,
});

export const findElementByCodename = (
  elements: ReadonlyArray<ContentTypeElements.ContentTypeElementModel>,
  codename: string,
): ContentTypeElements.ContentTypeElementModel | undefined =>
  elements.find((element) => element.codename === codename);

// The Management API prefixes snippet element codenames with the snippet codename
// (meta_title is stored as seo__meta_title), so both spellings count.
export const findSnippetElementByCodename = (
  snippet: Readonly<{
    codename: string;
    elements: ReadonlyArray<ContentTypeElements.ContentTypeElementModel>;
  }>,
  codename: string,
): ContentTypeElements.ContentTypeElementModel | undefined =>
  snippet.elements.find(
    (element) =>
      element.codename === codename || element.codename === `${snippet.codename}__${codename}`,
  );

export const findItemsByName = (
  items: ReadonlyArray<ContentItemModels.ContentItem>,
  name: string,
): ReadonlyArray<ContentItemModels.ContentItem> =>
  items.filter((item) => item.name.toLowerCase().includes(name.toLowerCase()));

export const truncate = (text: string, maxLength = 200): string =>
  text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;

export const flattenTaxonomyTerms = (
  terms: ReadonlyArray<TaxonomyModels.Taxonomy>,
): ReadonlyArray<TaxonomyModels.Taxonomy> =>
  terms.flatMap((term) => [term, ...flattenTaxonomyTerms(term.terms)]);

export const isVariantInStep = (
  variant: LanguageVariantModels.ContentItemLanguageVariant,
  workflows: ReadonlyArray<WorkflowModels.Workflow>,
  stepCodename: string,
): boolean => {
  const found = findVariantStep(variant, workflows);
  return found !== undefined && found.step.codename === stepCodename;
};

export const describeVariantStep = (
  variant: LanguageVariantModels.ContentItemLanguageVariant,
  workflows: ReadonlyArray<WorkflowModels.Workflow>,
): string => {
  const found = findVariantStep(variant, workflows);
  if (found === undefined) {
    return `unknown workflow ${variant.workflow.workflowIdentifier.id ?? "?"} step ${variant.workflow.stepIdentifier.id ?? "?"}`;
  }

  return `${found.workflow.codename}/${found.step.codename}`;
};

type WorkflowStep = Readonly<{ id: string; name: string; codename: string }>;

const findVariantStep = (
  variant: LanguageVariantModels.ContentItemLanguageVariant,
  workflows: ReadonlyArray<WorkflowModels.Workflow>,
): Readonly<{ workflow: WorkflowModels.Workflow; step: WorkflowStep }> | undefined => {
  const workflow = workflows.find(
    (candidate) => candidate.id === variant.workflow.workflowIdentifier.id,
  );
  if (workflow === undefined) {
    return undefined;
  }

  const step = [
    ...workflow.steps,
    workflow.publishedStep,
    workflow.scheduledStep,
    workflow.archivedStep,
  ].find((candidate) => candidate.id === variant.workflow.stepIdentifier.id);
  if (step === undefined) {
    return undefined;
  }

  return { workflow, step };
};

const hasStringMessage = (cause: unknown): cause is { message: string } =>
  typeof cause === "object" &&
  cause !== null &&
  "message" in cause &&
  typeof (cause as { message: unknown }).message === "string";
