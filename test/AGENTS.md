# test

- Vitest. `unit/` pure unit tests, `integration/` integration tests, `helpers/` shared helpers, `e2e/` the built binary against a real project.
- Command-level behavior (argument parsing, exit codes, which stream a message hits): fold a command's `register` over a real yargs instance and fake only the core call; see `integration/mapiCommand.test.ts`.
- Inject fakes into core instead of real I/O; for iapi reuse `helpers/iapiTestClient.ts`.
- The evals harness has its own unit tests in `evals/test/`; they run in `pnpm test` too.
- e2e: clone-per-run from an empty template env, gated on `E2E_MAPI_KEY`/`E2E_SOURCE_ENV_ID`, fails fast when unset. `pnpm test:e2e` (own `vitest.e2e.config.ts`, loads `.env`); excluded from `pnpm test` and the gate. CI `.github/workflows/e2e.yml`, fork PRs skipped.
