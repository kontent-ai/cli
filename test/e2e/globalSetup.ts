import { requireE2eConfig } from "./helpers/config.js";

// Fails the whole run before any test file when credentials are missing.
// Fork PRs never reach this (job-level `if:` in .github/workflows/e2e.yml);
// everywhere else pnpm test:e2e is a deliberate opt-in, so missing
// credentials are a setup error, not a reason to skip.
export default (): void => {
  requireE2eConfig();
};
