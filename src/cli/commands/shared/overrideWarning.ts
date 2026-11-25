import { targetHost } from "../../../core/kontentUrl/kontentUrl.js";
import { isSome } from "../../../core/lib/option.js";
import type { Overrides } from "../../../core/overrides/overrides.js";

// Auth0 values are never printed, only that they differ from the built-in ones.
export const formatOverrideWarning = (overrides: Overrides): string | null => {
  const hasAuth0Override = overrides.auth0.length > 0;
  if (isSome(overrides.kontentTarget)) {
    const url = `custom Kontent.ai URL ${targetHost(overrides.kontentTarget.value)}`;
    return hasAuth0Override ? `Using ${url} and custom login settings.` : `Using ${url}.`;
  }
  return hasAuth0Override ? "Using custom login settings." : null;
};
