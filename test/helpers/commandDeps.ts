import type { Auth0Config } from "../../src/cli/adapters/auth/config.js";
import type { CliConfigStore } from "../../src/cli/adapters/config/cliConfig.js";
import { noopTelemetry, type Telemetry } from "../../src/cli/adapters/telemetry/tracking.js";
import type { CommandDeps } from "../../src/cli/types/yargs.js";
import { loginContextFor } from "../../src/core/auth/loginContext.js";
import type { KontentTarget } from "../../src/core/kontentUrl/kontentUrl.js";
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

// Placeholder values: no test signs in, so nothing ever reaches this login server.
const TEST_AUTH0: Auth0Config = {
  domain: "login.test",
  clientId: "test-client",
  audience: "https://api.test/",
  scope: "openid",
};
const TEST_TARGET: KontentTarget = { kind: "domain", domain: "kontent.ai" };

export const commandDeps = (
  options: Readonly<{ telemetry?: Telemetry; isCiRun?: boolean; overrides?: Overrides }> = {},
): CommandDeps => ({
  telemetry: options.telemetry ?? noopTelemetry,
  isCiRun: options.isCiRun ?? false,
  kontentTarget: TEST_TARGET,
  overrides: options.overrides ?? NO_OVERRIDES,
  config: emptyConfig,
  login: { context: loginContextFor(TEST_AUTH0, TEST_TARGET), auth0: TEST_AUTH0 },
});
