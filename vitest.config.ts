import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // The e2e suite talks to a real Kontent.ai project; it runs via `pnpm test:e2e` only.
    exclude: ["test/e2e/**"],
    clearMocks: true,
  },
});
