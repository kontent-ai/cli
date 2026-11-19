import { describe, expect, it } from "vitest";
import { none, some } from "../../src/core/lib/option.js";
import { decideSnapshotTarget } from "../../src/core/snapshot/target.js";

const SNAPSHOT_MANIFEST = JSON.stringify({
  format_version: "1.0",
  environment_id: "11111111-2222-3333-4444-555555555555",
  management_api_version: "v2",
  kinds: ["types", "snippets"],
});

const SNAPSHOT_ENTRIES = ["manifest.json", "environment.json", "types", "snippets"];

describe("decideSnapshotTarget", () => {
  it.each([
    {
      name: "creates a missing folder",
      target: { kind: "missing" },
      expected: { kind: "create" },
    },
    {
      name: "updates an empty folder",
      target: { kind: "folder", entries: [], manifestText: none },
      expected: { kind: "update" },
    },
    {
      name: "updates a previous snapshot",
      target: { kind: "folder", entries: SNAPSHOT_ENTRIES, manifestText: some(SNAPSHOT_MANIFEST) },
      expected: { kind: "update" },
    },
    {
      name: "updates a previous snapshot with files someone added to it",
      target: {
        kind: "folder",
        entries: [...SNAPSHOT_ENTRIES, "notes.md"],
        manifestText: some(SNAPSHOT_MANIFEST),
      },
      expected: { kind: "update" },
    },
    {
      name: "refuses a folder with other files",
      target: { kind: "folder", entries: ["index.ts", "package.json"], manifestText: none },
      expected: { kind: "refuse", reason: "has-other-files" },
    },
    {
      name: "refuses a repository root (--path .)",
      target: { kind: "folder", entries: [".git", "src", "README.md"], manifestText: none },
      expected: { kind: "refuse", reason: "has-other-files" },
    },
    {
      name: "refuses a web app's public folder with its manifest.json",
      target: {
        kind: "folder",
        entries: ["manifest.json", "favicon.ico"],
        manifestText: some(JSON.stringify({ name: "My App", short_name: "App", icons: [] })),
      },
      expected: { kind: "refuse", reason: "foreign-manifest" },
    },
    {
      name: "refuses a manifest.json missing one of the snapshot fields",
      target: {
        kind: "folder",
        entries: ["manifest.json"],
        manifestText: some(JSON.stringify({ format_version: "1.0", environment_id: "x" })),
      },
      expected: { kind: "refuse", reason: "foreign-manifest" },
    },
    {
      name: "refuses a manifest.json that isn't JSON",
      target: { kind: "folder", entries: ["manifest.json"], manifestText: some("{ not json") },
      expected: { kind: "refuse", reason: "foreign-manifest" },
    },
  ] as const)("$name", ({ target, expected }) => {
    expect(decideSnapshotTarget(target)).toEqual(expected);
  });
});
