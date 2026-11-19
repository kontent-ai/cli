import { describe, expect, it } from "vitest";
import { isEntityFile } from "../../src/core/snapshot/layout.js";

describe("isEntityFile", () => {
  it.each([
    { path: ["environment.json"], expected: true },
    { path: ["types", "article.json"], expected: true },
    { path: ["languages", "6e3c0c8a-2d4b-4f53-9c1e-0a7b5d9e2f11.json"], expected: true },
    { path: ["workflows", "default.json"], expected: true },
    { path: ["manifest.json"], expected: false },
    { path: ["notes.md"], expected: false },
    { path: ["types"], expected: false },
    { path: ["types", "readme.txt"], expected: false },
    { path: ["types", "drafts", "old.json"], expected: false },
    { path: ["other", "article.json"], expected: false },
    { path: [], expected: false },
  ])("$path → $expected", ({ path, expected }) => {
    expect(isEntityFile(path)).toBe(expected);
  });
});
