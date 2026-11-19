import { describe, expect, it } from "vitest";
import { snapshotFileText } from "../../src/core/snapshot/fileText.js";
import { buildSnapshotManifest, isSnapshotManifest } from "../../src/core/snapshot/manifest.js";

const ENV_ID = "975bf280-fd91-488c-994c-2f04416e5ee3";

describe("buildSnapshotManifest", () => {
  it("writes the manifest from the spec", () => {
    expect(snapshotFileText(buildSnapshotManifest(ENV_ID))).toBe(
      [
        "{",
        '  "format_version": "1.0",',
        `  "environment_id": "${ENV_ID}",`,
        '  "management_api_version": "v2",',
        '  "kinds": [',
        '    "environment",',
        '    "types",',
        '    "snippets",',
        '    "taxonomies",',
        '    "languages",',
        '    "collections",',
        '    "workflows"',
        "  ]",
        "}",
        "",
      ].join("\n"),
    );
  });

  it("writes a manifest the next run recognises as a previous snapshot", () => {
    expect(isSnapshotManifest(snapshotFileText(buildSnapshotManifest(ENV_ID)))).toBe(true);
  });
});
