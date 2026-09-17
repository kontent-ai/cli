import { err, ok, type Result } from "../../src/lib/result.js";

// Shared by the e2e suite (E2E_*) and the eval harness (EVALS_*): the rule about
// what counts as unset has to be identical, only the variable names differ.
export const readRequiredEnvVars = <const TNames extends ReadonlyArray<string>>(
  names: TNames,
): Result<Readonly<Record<TNames[number], string>>, ReadonlyArray<string>> => {
  const entries = names.map((name) => [name, readEnvVar(name)] as const);
  const missing = entries.flatMap(([name, value]) => (value === undefined ? [name] : []));

  if (missing.length > 0) {
    return err(missing);
  }

  const present = entries.flatMap(([name, value]) =>
    value === undefined ? [] : [[name, value] as const],
  );
  return ok(Object.fromEntries(present) as Readonly<Record<TNames[number], string>>);
};

// An empty value counts as unset: .env.template ships the variables blank.
const readEnvVar = (name: string): string | undefined => {
  const value = process.env[name];
  return value === "" ? undefined : value;
};
