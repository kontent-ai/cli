import type { Auth0Settings } from "../auth/loginContext.js";
import {
  DEFAULT_KONTENT_DOMAIN,
  type KontentTarget,
  resolveKontentTarget,
  targetHost,
  targetKey,
} from "../kontentUrl/kontentUrl.js";
import { none, some } from "../lib/option.js";
import { isErr, isOk, ok, type Result } from "../lib/result.js";
import { type Auth0Setting, hasOverride, type Overrides } from "./overrides.js";

export type RunContext = Readonly<{
  target: KontentTarget;
  overrides: Overrides;
  // The folder under `<config base>/kontent/` that holds this run's config.
  configFolder: string;
}>;

const AUTH0_SETTINGS: ReadonlyArray<Auth0Setting> = ["domain", "clientId", "audience"];

export const resolveRunContext = (
  inputs: Readonly<{
    kontentUrl: string | undefined;
    bakedKontentUrl: string | undefined;
    auth0: Auth0Settings;
    builtInAuth0: Auth0Settings;
  }>,
): Result<RunContext, string> => {
  const baked = inputs.bakedKontentUrl === "" ? undefined : inputs.bakedKontentUrl;
  const target = resolveKontentTarget({ fromEnv: inputs.kontentUrl, baked });
  if (isErr(target)) {
    return target;
  }
  const builtInTarget = resolveKontentTarget({ fromEnv: undefined, baked });
  const overrides: Overrides = {
    kontentTarget:
      isOk(builtInTarget) && targetKey(builtInTarget.value) === targetKey(target.value)
        ? none
        : some(target.value),
    auth0: AUTH0_SETTINGS.flatMap((setting) =>
      inputs.auth0[setting] === inputs.builtInAuth0[setting]
        ? []
        : [{ setting, value: inputs.auth0[setting] }],
    ),
  };
  return ok({
    target: target.value,
    overrides,
    configFolder: configFolderFor(target.value, overrides, inputs.auth0.domain),
  });
};

// Production's `cli` folder belongs to an unmodified production run only, so an override
// never reads or writes production's default environment, user ID or telemetry state.
const configFolderFor = (
  target: KontentTarget,
  overrides: Overrides,
  auth0Domain: string,
): string => {
  if (targetKey(target) !== DEFAULT_KONTENT_DOMAIN) {
    return `cli-${toFolderPart(targetHost(target))}`;
  }
  if (!hasOverride(overrides)) {
    return "cli";
  }
  return auth0Domain === "" ? "cli-custom-login" : `cli-${toFolderPart(auth0Domain)}`;
};

const toFolderPart = (value: string): string => value.replace(/[^A-Za-z0-9.-]/g, "_");
