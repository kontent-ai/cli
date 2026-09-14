import type { ContentTypeElements } from "@kontent-ai/management-sdk";
import { describe, expect, it } from "vitest";
import { findSnippetElementByCodename } from "../lib/inspect.js";

describe("findSnippetElementByCodename", () => {
  const snippet = {
    codename: "seo",
    elements: [
      { codename: "seo__meta_title", type: "text" },
      { codename: "keywords", type: "text" },
    ] as unknown as ReadonlyArray<ContentTypeElements.ContentTypeElementModel>,
  };

  it("matches the prefixed codename the Management API stores", () => {
    expect(findSnippetElementByCodename(snippet, "meta_title")?.codename).toBe("seo__meta_title");
  });

  it("matches a bare codename too", () => {
    expect(findSnippetElementByCodename(snippet, "keywords")?.codename).toBe("keywords");
  });

  it("does not match an unrelated codename", () => {
    expect(findSnippetElementByCodename(snippet, "meta_description")).toBeUndefined();
  });
});
