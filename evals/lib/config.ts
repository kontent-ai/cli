import { err, isErr, ok, type Result } from "../../src/lib/result.js";
import { readRequiredEnvVars } from "../../test/helpers/requiredEnv.js";

export type EvalsConfig = Readonly<{
  mapiKey: string;
  sourceEnvId: string;
}>;

// The EVALS_* names stay distinct from the CLI's KONTENT_* variables and from
// the e2e suite's E2E_* ones, so an eval run can never touch either project.
export const requireEvalsConfig = (): Result<EvalsConfig, string> => {
  const vars = readRequiredEnvVars(["EVALS_MAPI_KEY", "EVALS_SOURCE_ENV_ID"]);

  if (isErr(vars)) {
    return err(describeMissing(vars.error));
  }

  return ok({ mapiKey: vars.value.EVALS_MAPI_KEY, sourceEnvId: vars.value.EVALS_SOURCE_ENV_ID });
};

const describeMissing = (missing: ReadonlyArray<string>): string =>
  `Missing eval environment variables: ${missing.join(", ")}. ` +
  "Export them in the shell that launches the eval run, or set them in .env (or the file named by EVALS_ENV_FILE).";
