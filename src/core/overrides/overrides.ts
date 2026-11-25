import type { Auth0Settings } from "../auth/loginContext.js";
import type { KontentTarget } from "../kontentUrl/kontentUrl.js";
import { isSome, type Option } from "../lib/option.js";

export type Auth0Setting = keyof Auth0Settings;

/**
 * Values that differ from the ones built into the CLI. Setting a variable to its built-in
 * value is not an override.
 */
export type Overrides = Readonly<{
  kontentTarget: Option<KontentTarget>;
  auth0: ReadonlyArray<Readonly<{ setting: Auth0Setting; value: string }>>;
}>;

export const hasOverride = (overrides: Overrides): boolean =>
  isSome(overrides.kontentTarget) || overrides.auth0.length > 0;
