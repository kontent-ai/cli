import { describe, expect, it } from "vitest";
import { none, some } from "../../src/core/lib/option.js";
import { planSnapshotWrite } from "../../src/core/snapshot/writePlan.js";

const MANIFEST = '{\n  "format_version": "1.0",\n  "environment_id": "env-a"\n}\n';
const OTHER_MANIFEST = '{\n  "format_version": "1.0",\n  "environment_id": "env-b"\n}\n';

const ENVIRONMENT = { path: ["environment.json"], text: '{\n  "name": "Site"\n}\n' };
const ARTICLE = { path: ["types", "article.json"], text: '{\n  "codename": "article"\n}\n' };
const PAGE = { path: ["types", "page.json"], text: '{\n  "codename": "page"\n}\n' };

const withCrlf = (text: string): string => text.replaceAll("\n", "\r\n");

const NOTHING = { manifest: none, writes: [], deletes: [] };

describe("planSnapshotWrite", () => {
  it.each([
    {
      name: "writes nothing for an unchanged snapshot",
      next: { manifest: MANIFEST, files: [ENVIRONMENT, ARTICLE] },
      current: { manifest: some(MANIFEST), files: [ENVIRONMENT, ARTICLE] },
      expected: NOTHING,
    },
    {
      name: "writes everything on a first run, the manifest included",
      next: { manifest: MANIFEST, files: [ENVIRONMENT, ARTICLE] },
      current: { manifest: none, files: [] },
      expected: { manifest: some(MANIFEST), writes: [ENVIRONMENT, ARTICLE], deletes: [] },
    },
    {
      name: "writes a changed file",
      next: { manifest: MANIFEST, files: [ENVIRONMENT, ARTICLE] },
      current: {
        manifest: some(MANIFEST),
        files: [ENVIRONMENT, { path: ARTICLE.path, text: '{\n  "codename": "old"\n}\n' }],
      },
      expected: { manifest: none, writes: [ARTICLE], deletes: [] },
    },
    {
      name: "writes a new file",
      next: { manifest: MANIFEST, files: [ARTICLE, PAGE] },
      current: { manifest: some(MANIFEST), files: [ARTICLE] },
      expected: { manifest: none, writes: [PAGE], deletes: [] },
    },
    {
      name: "deletes the file of a deleted entity",
      next: { manifest: MANIFEST, files: [ARTICLE] },
      current: { manifest: some(MANIFEST), files: [ARTICLE, PAGE] },
      expected: { manifest: none, writes: [], deletes: [PAGE.path] },
    },
    {
      name: "writes the new name and deletes the old one when a codename changes",
      next: { manifest: MANIFEST, files: [ARTICLE] },
      current: {
        manifest: some(MANIFEST),
        files: [{ path: ["types", "post.json"], text: ARTICLE.text }],
      },
      expected: { manifest: none, writes: [ARTICLE], deletes: [["types", "post.json"]] },
    },
    {
      name: "writes a changed manifest",
      next: { manifest: MANIFEST, files: [ARTICLE] },
      current: { manifest: some(OTHER_MANIFEST), files: [ARTICLE] },
      expected: { manifest: some(MANIFEST), writes: [], deletes: [] },
    },
    {
      name: "leaves files with \\r\\n line endings alone when the content is the same",
      next: { manifest: MANIFEST, files: [ARTICLE] },
      current: {
        manifest: some(withCrlf(MANIFEST)),
        files: [{ path: ARTICLE.path, text: withCrlf(ARTICLE.text) }],
      },
      expected: NOTHING,
    },
    {
      name: "never deletes a file that isn't an entity file",
      next: { manifest: MANIFEST, files: [ARTICLE] },
      current: {
        manifest: some(MANIFEST),
        files: [
          ARTICLE,
          { path: ["manifest.json"], text: MANIFEST },
          { path: ["notes.md"], text: "notes" },
          { path: ["types", "readme.txt"], text: "readme" },
          { path: ["types", "drafts", "old.json"], text: "{}" },
          { path: ["other", "page.json"], text: "{}" },
        ],
      },
      expected: NOTHING,
    },
  ])("$name", ({ next, current, expected }) => {
    expect(planSnapshotWrite(next, current)).toEqual(expected);
  });
});
