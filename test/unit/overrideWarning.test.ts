import { describe, expect, it } from "vitest";
import { formatOverrideWarning } from "../../src/cli/commands/shared/overrideWarning.js";
import { none, some } from "../../src/core/lib/option.js";
import type { Overrides } from "../../src/core/overrides/overrides.js";

const LOCAL = some({
  kind: "host",
  baseUrl: { protocol: "http", host: "localhost:3000" },
} as const);
const AUTH0 = [{ setting: "domain", value: "login.qa.example.com" }] as const;

describe("formatOverrideWarning", () => {
  it.each<readonly [string, Overrides, string | null]>([
    ["no override", { kontentTarget: none, auth0: [] }, null],
    ["a URL", { kontentTarget: LOCAL, auth0: [] }, "Using custom Kontent.ai URL localhost:3000."],
    ["Auth0 settings", { kontentTarget: none, auth0: AUTH0 }, "Using custom login settings."],
    [
      "both",
      { kontentTarget: LOCAL, auth0: AUTH0 },
      "Using custom Kontent.ai URL localhost:3000 and custom login settings.",
    ],
  ])("for %s", (_, overrides, expected) => {
    expect(formatOverrideWarning(overrides)).toBe(expected);
  });
});
