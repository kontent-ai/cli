import { defineConfig } from "vitest/config";

// Local runs read EVALS_* variables from one file: EVALS_ENV_FILE when set,
// otherwise .env. A variable already set in the shell is never overwritten. The
// two files never mix, so a key missing from EVALS_ENV_FILE fails the run in
// globalSetup.ts instead of silently targeting .env's environment.
const envFile = process.env.EVALS_ENV_FILE;
if (envFile !== undefined && envFile !== "") {
  // Not caught: a mistyped file name must not fall back to .env's environment.
  process.loadEnvFile(envFile);
  process.stderr.write(`Loaded ${envFile}\n`);
} else {
  try {
    process.loadEnvFile();
    process.stderr.write("Loaded .env\n");
  } catch {
    // no .env file
  }
}

export default defineConfig({
  test: {
    environment: "node",
    include: ["evals/run.eval.ts"],
    globalSetup: ["evals/globalSetup.ts"],
    // One environment, run sequentially: cloning happens once in globalSetup,
    // and tasks share that environment in dependency order.
    fileParallelism: false,
    testTimeout: 30_000,
    // Covers afterAll in run.eval.ts (writing the run summary/report). Vitest
    // does not apply hookTimeout to globalSetup itself - that setup()/teardown()
    // pair awaits with no timeout of its own.
    hookTimeout: 600_000,
    // Covers globalSetup's teardown (deleteEvalEnvironment), which the default
    // 10s would kill mid-delete.
    teardownTimeout: 120_000,
  },
});
