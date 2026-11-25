import type { CliConfigStore } from "../../src/cli/adapters/config/cliConfig.js";
import { noopTelemetry, type Telemetry } from "../../src/cli/adapters/telemetry/tracking.js";
import type { CommandDeps } from "../../src/cli/types/yargs.js";
import { none } from "../../src/core/lib/option.js";
import { ok } from "../../src/core/lib/result.js";
import type { Overrides } from "../../src/core/overrides/overrides.js";

const NO_OVERRIDES: Overrides = { kontentTarget: none, auth0: [] };

// In memory and empty: reads find nothing, writes succeed, nothing touches disk.
const emptyConfig: CliConfigStore = {
  path: () => "config.json",
  read: async () => ok({}),
  write: async () => ok(undefined),
};

export const commandDeps = (
  options: Readonly<{ telemetry?: Telemetry; overrides?: Overrides }> = {},
): CommandDeps => ({
  telemetry: options.telemetry ?? noopTelemetry,
  kontentTarget: { kind: "domain", domain: "kontent.ai" },
  overrides: options.overrides ?? NO_OVERRIDES,
  config: emptyConfig,
});
