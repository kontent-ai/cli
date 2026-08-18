import { writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { createMapiClient } from "../../../src/lib/mapi/client.js";
import type { E2eConfig } from "./config.js";
import { randomSuffix } from "./random.js";

export type TestEnvironment = Readonly<{
  envId: string;
  name: string;
}>;

export const cloneTestEnvironment = async (config: E2eConfig): Promise<TestEnvironment> => {
  const name = `e2e-${Math.floor(Date.now() / 1000)}-${randomSuffix()}`;
  const sourceClient = createMapiClient({ token: config.mapiKey, envId: config.sourceEnvId });
  const cloned = await sourceClient.cloneEnvironment().withData({ name }).toPromise();

  await waitUntilCloned(config, cloned.data.id);

  return { envId: cloned.data.id, name };
};

export const deleteTestEnvironment = async (config: E2eConfig, envId: string): Promise<void> => {
  try {
    await createMapiClient({ token: config.mapiKey, envId }).deleteEnvironment().toPromise();
  } catch (error) {
    // A missing environment means an earlier cleanup already won the race.
    if (isNotFoundError(error)) {
      return;
    }
    throw error;
  }
};

// Hands the cloned environment id to the CI `if: always()` cleanup step, which
// deletes the clone even when the job is cancelled before afterAll runs.
export const recordEnvironmentId = async (envId: string): Promise<void> => {
  const filePath = process.env.E2E_ENV_ID_FILE;
  if (filePath === undefined || filePath === "") {
    return;
  }
  await writeFile(filePath, envId);
};

const POLL_DELAY_MS = 2000;
// Stays under the suite's 5-minute hookTimeout so the timeout error below wins.
const MAX_POLL_ATTEMPTS = 120;

const waitUntilCloned = async (config: E2eConfig, envId: string): Promise<void> => {
  const client = createMapiClient({ token: config.mapiKey, envId });

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    const state = await client.getEnvironmentCloningState().toPromise();
    if (state.data.cloningInfo.cloningState === "done") {
      return;
    }
    await delay(POLL_DELAY_MS);
  }

  throw new Error(`Environment ${envId} did not finish cloning in time.`);
};

// The SDK does not expose the HTTP status uniformly, so this checks the shapes
// seen in practice; a false negative only surfaces an already-deleted error.
const isNotFoundError = (error: unknown): boolean => {
  const status = (error as { originalError?: { response?: { status?: number } } }).originalError
    ?.response?.status;
  if (status === 404) {
    return true;
  }
  return error instanceof Error && /not found|404/i.test(error.message);
};
