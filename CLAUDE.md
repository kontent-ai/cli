# CLAUDE.md

Guidance for agents working in this repo. The Kontent.ai CLI (`kontent` bin → `src/index.ts`) is the command-line interface. ESM, TypeScript, pnpm.

**Keep this file current, concise, and token-aware.** When a change alters a documented architecture/convention/pattern, update CLAUDE.md in the same change — but prune stale or low-value lines rather than letting it grow. Always check before halting whether anything you did makes a statement here stale.

## Before halting

Run and pass these (same gate as CI, in order):

```
pnpm typecheck && pnpm lint && pnpm biome:check && pnpm test
```

Autofix is available: `pnpm lint:fix`, `pnpm biome:fix`. Build with `pnpm build` (tsdown). Node version is `.nvmrc` (`lts/*`). Always use pnpm, never npm/yarn.

## Architecture

Three layers, dependencies point downward only (`commands → core → lib`):

- `src/index.ts` — composition root. Folds each command's `register` (from `src/commands/registry.ts`) over yargs via `reduce`, wires shared `deps` (telemetry).
- `src/commands/**` — yargs wiring + presentation only. Register the command, call core, format output, log, set `process.exitCode`, fire the telemetry tracker. No business logic.
- `src/core/**` — orchestration of business logic. Returns `Result`/`Option`; never writes to the console directly (logs only through a passed `Logger`). **Exception:** interactive commands may drive their own terminal UI from core — e.g. `src/core/project/bootstrap.ts` uses the prompts of `src/lib/ui/prompts.ts` (spinners, `confirm`/`select`, notes) directly because the flow is inherently interactive. Keep non-interactive core free of direct console writes.
- `src/lib/**` — reusable primitives: `auth/`, `iapi/`, `mapi/`, `config/`, `telemetry/`, plus `result.ts` and `option.ts`.

Adding a command: export a `register: RegisterCommand` (see `src/commands/login/login.ts`), then add its import to the `register` array in the parent command or `src/commands/registry.ts`. Then run `pnpm docs:generate` (`scripts/generateCommandDocs.ts`) — it replays the registrations against a recording proxy and rewrites the generated docs: the marker-fenced command table in the root `README.md`, and the `<!-- reference:start/end -->` block in each command folder's `README.md` (created as a skeleton when missing). Prose outside the markers is handwritten — write command docs there, never inside the block. Two opt-out sets in the script: `commandsWithoutPage` (no colocated README) and `commandsWithoutIndexEntry` (no root-README table row; telemetry is there). The generator errors on a command-folder README with markers but no matching command (stale after rename/removal) — resolve by hand; it never deletes pages.

### API clients

- `iapi` (`src/lib/iapi`) — internal Kontent.ai API; hand-rolled client, one file per endpoint, over `@kontent-ai/core-sdk`. Endpoint validators (the `schema` field) must be **`zod/mini`** (`import * as z from "zod/mini"`) — classic `zod` won't infer the payload.
- `mapi` (`src/lib/mapi`) — public Management API via `@kontent-ai/management-sdk`. `src/lib/mapi/raw` is the deliberate opposite: an adapter-backed passthrough (no schema, no response interpretation) behind `kontent mapi`, where a 4xx/5xx is a result, not an error.
- `@kontent-ai/core-sdk` — shared HTTP/SDK layer both clients build on.

**Commands build clients; core receives them.** The command builds the `iapiClient`/`mapiClient` and passes them into core (e.g. `performBootstrap(params, { logger, iapiClient, mapiClient })`); core never constructs clients itself. Auth failure is handled in the command, not surfaced as a core `Result` error.

### Output channels

- **stdout** — the data the command exists to produce, and nothing else. It is never level-gated: `--logLevel none` must still print a payload, because a response body is not a log.
- **stderr** — everything said *about* producing it: progress, warnings, errors, verbose traces. This is the POSIX meaning of stderr (diagnostics, not errors), and how curl, git and npm behave.

A handler that logs starts with `const logger = createLoggerFromArgs(args)` (`src/log.ts`) and passes that `Logger` down; one that only emits a payload takes no logger at all (`src/commands/telemetry/status.ts`).
Core takes the logger as a parameter or inside its `deps` object; `createLoggerFromArgs` is the only place that resolves the `--logLevel`/`--verbose` pair; everything else builds a logger from a single `LogLevel` via `createLogger`. The `sink` parameter is a test seam, not a routing knob — never point a log at stdout.

## Conventions

- **Functional, not OOP.** No classes. Modules of small, composable, pure functions. Compose with `reduce`, `match` (`ts-pattern`), and the `Result`/`Option` combinators.
- **Errors are values.** Don't throw across layers. Use `Result<T, E>` (`src/lib/result.ts`) and `Option<T>` (`src/lib/option.ts`); convert thrown errors at the boundary with `tryAsync`/`fromThrowable`.
- **Boolean names** start with a helper verb: is/has/can/should/was (e.g. `isAlreadyAuthenticated`, `shouldForceRefresh`). Applies to params, locals, fields, and props.
- **`const` over `let`** unless reassignment is genuinely required.
- **No `return` on the same line as its condition** — put the guard's body on its own line.
- **Prefer `readonly`** types and `ReadonlyArray` for inputs.
- **ESM import extensions:** relative imports must end in `.js` (biome enforces `useImportExtensions`).
- **No redundant wrappers.** Don't add a function that only forwards to another; reuse existing helpers instead of duplicating logic.
- **Comments only for non-obvious "why".** No restating-the-code comments, no repeating a fact already stated elsewhere (put domain facts once, on the type), no justifying a change to the reviewer ("X already did Y, so..."). No emojis anywhere.
- **Exports first.** A module's exported types and functions go at the top, private helpers below them. Arrow consts are only called after module evaluation, so referring downward is safe.
- **No barrel files** except a deliberate public API.

## Testing

Vitest; `test/unit/` for pure unit tests, `test/integration/` for integration tests, `test/helpers/` for shared helpers. Command-level behavior (argument parsing, exit codes, which stream a message lands on) is tested by folding a command's `register` over a real yargs instance and faking only the core call underneath — see `test/integration/mapiCommand.test.ts`. Run `pnpm test`. Inject fakes into core instead of real I/O — for iapi reuse `test/helpers/iapiTestClient.ts` (real client over core-sdk's `HttpAdapter` seam, declarative routes).

`test/e2e/` runs the built binary against a real Kontent.ai project (clone-per-run from an empty template env). Gated on `E2E_MAPI_KEY`/`E2E_SOURCE_ENV_ID` (fails fast with an error when unset). Run with `pnpm test:e2e` (own `vitest.e2e.config.ts`, loads `.env`); excluded from `pnpm test` and the before-halting gate. CI: `.github/workflows/e2e.yml` (master push, PRs, manual; fork PRs are skipped at the job level — no secret access).

## Telemetry

Amplitude-based, see `TELEMETRY.md`. Env vars are read from `process.env` where they apply, never mapped onto yargs options — `src/index.ts` deliberately does not call `.env()`, so a stray `KONTENT_*` var cannot break an unrelated command.

Event names and the custom event-property keys we set are kebab-case (`cli__some-command`, `error-code`, `sample-project-type`); single words stay bare (`outcome`). Amplitude's built-in fields (`device_id`, `user_id`, `platform`, `app_version`, `os_name`, `os_version`) are the exception and keep `snake_case`.
