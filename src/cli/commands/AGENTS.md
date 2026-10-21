# src/cli/commands

- Yargs wiring and presentation only: register, call core, format output, log, set `process.exitCode`, fire the telemetry tracker. No business logic.
- New command: export `register: RegisterCommand` (see `login/login.ts`), add it to `commandsToRegister` in `registry.ts` or a parent's `subcommandsToRegister`, then run `pnpm docs:generate`.
- Obtain the `iapiClient`/`mapiClient` here and pass them into core.
- Resolving arguments into real inputs (reading the `--input` file, stdin) lives here.
- A handler that logs starts with `const logger = createLoggerFromArgs(args)`; a payload-only handler takes none.

## Environment id

`kontent environment use` stores a default environment id (`envId` in the CLI config).

- A plain `--envId` (one environment) falls back to the stored id, whether the command reads or writes.
- `--sourceEnvId`/`--targetEnvId`, array flags and positional environment ids never fall back.
- A command whose target is the environment itself (delete, mark as production) takes the id as a positional argument.

## Generated docs

`pnpm docs:generate` runs `scripts/generateCommandDocs.ts`.

- Rewrites the marker-fenced table in root `README.md` and the `<!-- reference:start/end -->` block in each command README. Prose outside the markers is handwritten, never write inside them.
- A leaf's README lands in its own folder, or the parent group's folder when it has none.
- Two opt-out sets at the top of the script, both keyed by the top-level command name and independent of each other:
  - `commandsWithoutPage`: the command gets no README of its own.
  - `commandsWithoutIndexEntry`: the command gets no row in the root `README.md` table.
- After a command is renamed or removed, its old README is left behind. The generator fails on it and never deletes it: move the handwritten prose to the new README, then delete the old file yourself.

## Orchestration (`perform*.ts`, `shared/`)

- Orchestration of business logic. Use `Result` for recoverable failures and `Option` for optional values. The `run*.ts` files own presentation and exit codes.
- Operations receive `iapiClient`/`mapiClient` from the command, e.g. `performBootstrap(params, { logger, iapiClient, mapiClient })`. A client is built only where a fresh token first becomes one: `login/performLogin.ts` and `shared/authenticatedClient.ts`.
- Never writes to stdout or the console. The payload is returned as a value and the command prints it.
- Diagnostics go only through the passed `Logger` (a parameter, or inside `deps`), which writes to stderr.
- Pick the level per message: `logger.info("standard", ...)` for progress the user should see, `"verbose"` for traces. `logger.error(...)` takes no level.
- Exception: an inherently interactive flow may drive its own terminal UI, e.g. `project/sample/bootstrap/performBootstrap.ts`. Prompts, spinners and notes must go through the wrappers in `src/cli/adapters/prompts/prompts.ts`: they force stderr, while clack on its own writes to stdout and breaks the output contract. Everything else stays free of direct writes.
