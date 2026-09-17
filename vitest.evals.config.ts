import { defineConfig } from "vitest/config";

// Mirrors vitest.e2e.config.ts: local runs read EVALS_*/E2E_*-style gate
// variables from .env, real env vars (e.g. in CI) take precedence, and a
// missing .env is fine as long as the shell provides them - globalSetup.ts
// fails the run when they are missing everywhere.
try {
  process.loadEnvFile();
} catch {
  // no .env file
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
