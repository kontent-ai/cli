import { defineConfig } from "vitest/config";

// Local runs read the E2E_* gate variables from .env; CI sets real env vars,
// which take precedence. A missing .env is fine when the shell provides the
// variables; test/e2e/globalSetup.ts fails the run when they are missing
// everywhere.
try {
  process.loadEnvFile();
} catch {
  // no .env file
}

// The e2e domain is deliberately independent of the KONTENT_URL used for local
// CLI development: E2E_KONTENT_URL when set, production otherwise. Helpers and
// the spawned CLI both read KONTENT_URL, so one overwrite here covers both.
process.env.KONTENT_URL =
  process.env.E2E_KONTENT_URL === undefined || process.env.E2E_KONTENT_URL === ""
    ? "kontent.ai"
    : process.env.E2E_KONTENT_URL;

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/e2e/**/*.test.ts"],
    globalSetup: ["test/e2e/globalSetup.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    // Covers environment cloning, which the API performs asynchronously.
    hookTimeout: 300_000,
  },
});
