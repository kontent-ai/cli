# test

- Vitest. `unit/` pure unit tests, `integration/` integration tests, `helpers/` shared helpers, `e2e/` the packed and installed CLI against a real project.
- Command-level behavior: argument parsing reuses the exported `<cmd>Command` on a real yargs instance with a recording handler (see `unit/requestCommand.test.ts`); exit codes and which stream a message hits are asserted on the data a `format*Output` returns (see `unit/formatRequestOutput.test.ts`).
- Core: table tests, no fakes. Workflows: in-memory fakes of their effects. Adapters: at the transport seam, reusing `helpers/httpTestAdapter.ts` and `helpers/iapiTestClient.ts`. `vi.mock` only for third-party code without a seam.
- The evals harness has its own unit tests in `evals/test/`; they run in `pnpm test` too.
- e2e: clone-per-run from an empty template env, against the packed CLI installed outside the repo. Gated on `E2E_MAPI_KEY`/`E2E_SOURCE_ENV_ID`, fails fast when unset. `pnpm test:e2e` (own `vitest.e2e.config.ts`, loads `.env`); excluded from `pnpm test` and the gate. CI `.github/workflows/e2e.yml`.
