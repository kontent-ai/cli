export type E2eConfig = Readonly<{
  mapiKey: string;
  sourceEnvId: string;
}>;

// The E2E_* names keep the suite's own credentials distinct from the KONTENT_*
// ones the CLI reads, so a run never picks up a developer's working environment.
export const requireE2eConfig = (): E2eConfig => {
  const mapiKey = readVar("E2E_MAPI_KEY");
  const sourceEnvId = readVar("E2E_SOURCE_ENV_ID");
  if (mapiKey === undefined || sourceEnvId === undefined) {
    const missing = [
      ...(mapiKey === undefined ? ["E2E_MAPI_KEY"] : []),
      ...(sourceEnvId === undefined ? ["E2E_SOURCE_ENV_ID"] : []),
    ];
    throw new Error(
      `Missing e2e environment variables: ${missing.join(", ")}. ` +
        "The e2e suite runs against a real Kontent.ai project and cannot start without them. " +
        "Copy .env.template to .env and fill them in, or export them in the environment.",
    );
  }
  return { mapiKey, sourceEnvId };
};

// An empty value counts as unset: .env.template ships the variables blank.
const readVar = (name: string): string | undefined => {
  const value = process.env[name];
  return value === "" ? undefined : value;
};
