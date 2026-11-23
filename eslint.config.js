import kontentAiConfig from "@kontent-ai/eslint-config";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  globalIgnores(["dist", "node_modules", "coverage"]),
  {
    extends: [kontentAiConfig],
    files: ["src/**/*.ts", "test/**/*.ts", "evals/**/*.ts", "scripts/**/*.ts"],
    languageOptions: {
      parserOptions: {
        project: ["./tsconfig.json"],
      },
    },
  },
  {
    // Test fakes return promises without awaiting; this rule would make them async and Biome's useAwait then rejects them.
    files: ["test/**/*.ts"],
    rules: {
      "@typescript-eslint/promise-function-async": "off",
    },
  },
  {
    files: ["src/core/**/*.ts"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        { patterns: [{ group: ["**/cli/**"], message: "core never imports from cli." }] },
      ],
    },
  },
  {
    files: ["src/cli/adapters/**/*.ts"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["**/commands/**"], message: "adapters never import from commands." },
          ],
        },
      ],
    },
  },
]);
