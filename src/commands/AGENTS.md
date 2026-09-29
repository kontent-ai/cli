# src/commands

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
