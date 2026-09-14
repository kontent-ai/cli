import { isErr } from "../../../src/lib/result.js";
import { readRequiredEnvVars } from "../../helpers/requiredEnv.js";

export type E2eConfig = Readonly<{
  mapiKey: string;
  sourceEnvId: string;
}>;

// The E2E_* names keep the suite's own credentials distinct from the KONTENT_*
// ones the CLI reads, so a run never picks up a developer's working environment.
export const requireE2eConfig = (): E2eConfig => {
  const vars = readRequiredEnvVars(["E2E_MAPI_KEY", "E2E_SOURCE_ENV_ID"]);

  if (isErr(vars)) {
    throw new Error(
      `Missing e2e environment variables: ${vars.error.join(", ")}. ` +
        "The e2e suite runs against a real Kontent.ai project and cannot start without them. " +
        "Copy .env.template to .env and fill them in, or export them in the environment.",
    );
  }

  return { mapiKey: vars.value.E2E_MAPI_KEY, sourceEnvId: vars.value.E2E_SOURCE_ENV_ID };
};
