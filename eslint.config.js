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
    // Contradicts Biome's lint/suspicious/useAwait (@kontent-ai/biome-config) for test fakes and helpers, same as kontent-ai/smart-link.
    files: ["test/**/*.ts", "evals/**/*.ts", "scripts/**/*.ts"],
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
