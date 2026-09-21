# AGENTS.md

The Kontent.ai CLI (`kontent` bin, entry `src/index.ts`): ESM, TypeScript, pnpm.

## After changing code, before handing off

```
pnpm typecheck && pnpm lint && pnpm biome:check && pnpm test
```

- Autofix: `pnpm lint:fix`, `pnpm biome:fix`. Build: `pnpm build`.
- Node is `lts`; `.nvmrc` and CI `runtime:` must stay in step.

## Layers

Dependencies point downward only: `commands -> core -> lib`.

- `src/commands/**` yargs wiring and presentation.
- `src/core/**` orchestration of business logic.
- `src/lib/**` reusable primitives.
- Nested `AGENTS.md` files hold the details: `src/commands/`, `src/core/`, `src/lib/`, `test/`, `evals/`. Read the one covering a folder before editing in it.
- Editing `scripts/generateCommandDocs.ts`: the generated-docs rules are in `src/commands/AGENTS.md`.
- Commands obtain API clients and pass them into core; core operations take clients as input.
- Core reports recoverable failures as `Result` and never writes to the console (exception: interactive flows, see core's file). Commands own presentation and exit codes.

## Auth

- The `kontent login` token is the credential for both iapi and mapi. A logged-in user needs no API key, so a command only ever resolves the environment id.

## Output channels

- stdout: only the command's payload (response body, token, list). `--logLevel none` still prints it.
- stderr: progress, warnings, errors, verbose traces. Never the payload.
- `createLoggerFromArgs` (`src/log.ts`) is the only place resolving `--logLevel`/`--verbose`.

## Conventions

- Functional, not OOP. No classes. Branch with `match` (`ts-pattern`), not `switch`.
- Errors are values: `Result` (`src/lib/result.ts`), `Option` (`src/lib/option.ts`); convert thrown errors at boundaries with `tryAsync`/`fromThrowable`.
- Boolean names start with is/has/can/should/was.
- `const` over `let`.
- No `return` on the same line as its condition.
- Prefer `readonly` and `ReadonlyArray`.
- Relative imports end in `.js`.
- No redundant forwarding wrappers.
- Comments only for non-obvious why: no restating code, no justifying changes to the reviewer.
- Exports first, then private helpers in call order, depth-first; a private constant sits directly above its one user.
- No barrel files except a deliberate public API.

## Telemetry

- Amplitude-based, see `TELEMETRY.md`.
- Env vars come from `process.env`, never yargs options (`src/index.ts` deliberately omits `.env()`).
- Event names and custom property keys are kebab-case (`cli__some-command`, `error-code`); Amplitude built-in fields keep snake_case.
