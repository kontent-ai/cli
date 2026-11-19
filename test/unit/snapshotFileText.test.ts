import { describe, expect, it } from "vitest";
import { snapshotFileText } from "../../src/core/snapshot/fileText.js";

describe("snapshotFileText", () => {
  it("indents by two spaces, uses \\n and ends with a newline", () => {
    const text = snapshotFileText({
      id: "a1",
      codename: "article",
      elements: [{ type: "text" }],
      content_groups: [],
      is_active: true,
    });

    expect(text).toBe(
      [
        "{",
        '  "id": "a1",',
        '  "codename": "article",',
        '  "elements": [',
        "    {",
        '      "type": "text"',
        "    }",
        "  ],",
        '  "content_groups": [],',
        '  "is_active": true',
        "}",
        "",
      ].join("\n"),
    );
  });

  it("keeps keys in the order the API sent them", () => {
    const entity = JSON.parse('{"name":"Article","id":"a1","codename":"article"}');

    expect(snapshotFileText(entity)).toBe(
      ["{", '  "name": "Article",', '  "id": "a1",', '  "codename": "article"', "}", ""].join("\n"),
    );
  });

  it("writes non-ASCII characters as they are", () => {
    expect(snapshotFileText({ codename: "French_–_Switzerland" })).toContain(
      '"French_–_Switzerland"',
    );
  });

  it("gives the same text for the same response on every run", () => {
    const response = '{"id":"a1","elements":[{"id":"e1","type":"text","name":"Title"}]}';

    expect(snapshotFileText(JSON.parse(response))).toBe(snapshotFileText(JSON.parse(response)));
  });
});
