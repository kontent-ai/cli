import { isNone } from "../../../src/lib/option.js";
import { isErr, ok } from "../../../src/lib/result.js";
import { articleElementCodenames } from "../../lib/codenames.js";
import {
  describeList,
  findElementByCodename,
  lookupByCodename,
  missingAssertion,
} from "../../lib/inspect.js";
import type { EvalTask } from "../../lib/types.js";

export const updateContentType: EvalTask = {
  id: "update-content-type",
  dependsOn: ["update-language-variant"],
  prompt:
    'A few changes to the Article type. Add a "Reading time" number field, codename reading_time, and put it right after the title. Authors want tables and images in the body now, so allow those, and raise the summary limit to 300 characters. "Author" should be called "Written by" from now on, keep its codename.',
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

    const elements = articleLookup.value.value.data.elements;
    const readingTime = findElementByCodename(elements, "reading_time");
    const body = findElementByCodename(elements, "body");
    const summary = findElementByCodename(elements, "summary");
    const author = findElementByCodename(elements, "author");
    const presentCodenames = new Set(elements.map((element) => element.codename));
    const requiredCodenames: ReadonlyArray<string> = [...articleElementCodenames, "reading_time"];
    const lostCodenames = requiredCodenames.filter((codename) => !presentCodenames.has(codename));

    return ok([
      {
        id: "reading-time-added",
        passed: readingTime !== undefined && readingTime.type === "number",
        evidence:
          readingTime === undefined
            ? "reading_time element not found"
            : `reading_time: type=${readingTime.type}`,
      },
      {
        id: "body-allows-tables-and-images",
        passed:
          body !== undefined &&
          body.type === "rich_text" &&
          (body.allowed_blocks === undefined ||
            body.allowed_blocks.length === 0 ||
            (body.allowed_blocks.includes("tables") && body.allowed_blocks.includes("images"))),
        evidence:
          body === undefined
            ? "body element not found"
            : `body allowed_blocks: ${describeList(body.type === "rich_text" ? (body.allowed_blocks ?? []) : [])}`,
      },
      {
        id: "summary-limit-300",
        passed:
          summary !== undefined &&
          summary.type === "text" &&
          summary.maximum_text_length?.value === 300 &&
          summary.maximum_text_length.applies_to === "characters",
        evidence:
          summary === undefined
            ? "summary element not found"
            : `summary maximum_text_length: value=${summary.type === "text" ? summary.maximum_text_length?.value : "n/a"} applies_to=${summary.type === "text" ? summary.maximum_text_length?.applies_to : "n/a"}`,
      },
      {
        id: "author-renamed-codename-kept",
        passed:
          author !== undefined &&
          "name" in author &&
          typeof author.name === "string" &&
          author.name.toLowerCase() === "written by",
        evidence:
          author === undefined
            ? "author element not found"
            : `author name: ${"name" in author && typeof author.name === "string" ? author.name : "n/a"}; codename: ${author.codename}`,
      },
      {
        id: "no-element-lost",
        passed: lostCodenames.length === 0,
        evidence: `element codenames: ${describeList([...presentCodenames].map((codename) => codename ?? "?"))}; missing: ${describeList(lostCodenames)}`,
      },
      {
        id: "seo-snippet-still-attached",
        passed: elements.some((element) => element.type === "snippet"),
        evidence: `element types: ${describeList(elements.map((element) => element.type))}`,
      },
    ]);
  },
};
