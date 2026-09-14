import { writeFile } from "node:fs/promises";

// Hands the cloned environment id to the CI `if: always()` cleanup step, which
// deletes the clone even when the job is cancelled before afterAll runs.
export const recordEnvironmentId = async (envId: string): Promise<void> => {
  const filePath = process.env.E2E_ENV_ID_FILE;
  if (filePath === undefined || filePath === "") {
    return;
  }
  await writeFile(filePath, envId);
};
