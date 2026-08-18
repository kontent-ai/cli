import { filter, flatMap, fromNullable, map, type Option } from "../../../src/lib/option.js";

export type E2eConfig = Readonly<{
  mapiKey: string;
  sourceEnvId: string;
}>;

// The E2E_* names deliberately avoid the KONTENT_ prefix: yargs maps every
// KONTENT_* env var to a CLI argument and .strict() rejects unknown ones.
export const readE2eConfig = (): Option<E2eConfig> =>
  flatMap(readVar("E2E_MAPI_KEY"), (mapiKey) =>
    map(readVar("E2E_SOURCE_ENV_ID"), (sourceEnvId) => ({ mapiKey, sourceEnvId })),
  );

// An empty value counts as unset: .env.template ships the variables blank.
const readVar = (name: string): Option<string> =>
  filter(fromNullable(process.env[name]), (value) => value !== "");
