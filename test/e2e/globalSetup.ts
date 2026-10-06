import type { TestProject } from "vitest/node";
import {
  cloneTestEnvironment,
  deleteTestEnvironment,
  type TestEnvironment,
} from "../helpers/environment.js";
import { type E2eConfig, requireE2eConfig } from "./helpers/config.js";
import { recordEnvironmentId } from "./helpers/environment.js";
import { packAndInstallCli } from "./helpers/installCli.js";

declare module "vitest" {
  interface ProvidedContext {
    e2e: Readonly<{
      envId: string;
      cliEntry: string;
    }>;
  }
}

// Fails the whole run before any test file when credentials are missing.
// Fork PRs never reach this (job-level `if:` in .github/workflows/e2e.yml);
// everywhere else pnpm test:e2e is a deliberate opt-in, so missing
// credentials are a setup error, not a reason to skip.
export default async ({ provide }: TestProject): Promise<() => Promise<void>> => {
  const config = requireE2eConfig();

  const [cloned, installed] = await Promise.allSettled([
    cloneAndRecord(config),
    packAndInstallCli(),
  ]);
  if (cloned.status === "rejected") {
    throw cloned.reason;
  }
  const { envId } = cloned.value;
  if (installed.status === "rejected") {
    await deleteTestEnvironment(config, envId);
    throw installed.reason;
  }

  provide("e2e", { envId, cliEntry: installed.value });

  return async () => {
    await deleteTestEnvironment(config, envId);
  };
};

const cloneAndRecord = async (config: E2eConfig): Promise<TestEnvironment> => {
  const env = await cloneTestEnvironment(config, "e2e");
  await recordEnvironmentId(env.envId);
  return env;
};
