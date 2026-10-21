# AGENTS.md

The Kontent.ai CLI (`kontent` bin, entry `src/index.ts`): ESM, TypeScript, pnpm.

## After changing code, before handing off

```
pnpm typecheck && pnpm lint && pnpm biome:check && pnpm knip && pnpm test
```

- Autofix: `pnpm lint:fix`, `pnpm biome:fix`. Build: `pnpm build`.
- Node is `lts`; `.nvmrc` and CI `runtime:` must stay in step.

## Layers

Dependencies point inward: `cli/commands -> cli/adapters -> core` and `cli/commands -> core`. `core` imports nothing from `cli`.

- `src/cli/commands/**` yargs wiring, orchestration (`perform*.ts`, `shared/`) and presentation.
- `src/cli/adapters/**` I/O: API clients, keyring, config file, telemetry, prompts.
- `src/core/**` pure domain code, with generic primitives in `core/lib`.
- Nested `AGENTS.md` files hold the details: `src/cli/commands/`, `src/cli/adapters/`, `src/core/`, `test/`, `evals/`. Read the one covering a folder before editing in it.
- Editing `scripts/generateCommandDocs.ts`: the generated-docs rules are in `src/cli/commands/AGENTS.md`.
- Commands obtain API clients and pass them into the orchestration; operations take clients as input.
- Orchestration reports recoverable failures as `Result` and never writes to the console (exception: interactive flows, see the commands file). The `run*.ts` files own presentation and exit codes.

## Auth

- The `kontent login` token is the credential for both iapi and mapi. A logged-in user needs no API key, so a command only ever resolves the environment id.

## Output channels

- stdout: only the command's payload (response body, token, list). `--logLevel none` still prints it.
- stderr: progress, warnings, errors, verbose traces. Never the payload.
- `createLoggerFromArgs` (`src/cli/log.ts`) is the only place resolving `--logLevel`/`--verbose`.

## Conventions

- Functional, not OOP. No classes. Branch with `match` (`ts-pattern`), not `switch`.
- Errors are values: `Result` (`src/core/lib/result.ts`), `Option` (`src/core/lib/option.ts`); convert thrown errors at boundaries with `tryAsync`/`fromThrowable`.
- Boolean names start with is/has/can/should/was.
- `const` over `let`.
- No `return` on the same line as its condition.
- Prefer `readonly` and `ReadonlyArray`.
- Relative imports end in `.js`.
- No redundant forwarding wrappers.
- Comments only for non-obvious why: no restating code, no justifying changes to the reviewer.
- Exports first, then private helpers in call order, depth-first; a private constant sits directly above its one user.
- No barrel files except a deliberate public API.
- Prefer public MAPI endpoints; use IAPI only where MAPI has no equivalent.

## Dead code

- `pnpm knip` (`knip.jsonc`) fails on unused files, exports, types and dependencies, unlisted dependencies, and runtime import cycles (type-only cycles pass). An export used only in its own file passes.
- A finding that is dead: delete it. A finding that is live in a way Knip cannot see (run by path, loaded at runtime): add it to `knip.jsonc` with a one-line reason.
- Never silence a finding by re-exporting the symbol or by ignoring a whole folder.

## Telemetry

- Amplitude-based, see `TELEMETRY.md`.
- Env vars come from `process.env`, never yargs options (`src/index.ts` deliberately omits `.env()`).
- Event names and custom property keys are kebab-case (`cli__some-command`, `error-code`); Amplitude built-in fields keep snake_case.
