# src/cli/commands

- A command has a register file `<cmd>.ts` and, when it does work, a `run<Cmd>.ts`.
- `<cmd>.ts` is yargs registration only. Its handler lazy-imports `run<Cmd>.ts` (`await import(...)`), so a command's dependencies load only when it runs.
- `run<Cmd>.ts` exports two functions:
  - `<cmd>(effects)`: the workflow. Effects in, `Result` out; sequences the effects and calls core.
  - `run<Cmd>(args, deps)`: builds the real effects from adapters, calls the workflow, and presents the result: messages, streams, `process.exitCode`, the telemetry tracker.
- New command: export `register: RegisterCommand` (see `login/login.ts`), add it to `commandsToRegister` in `registry.ts` or a parent's `subcommandsToRegister`, then run `pnpm docs:generate`.
- A command gets its own folder when it has its own README page or files beyond its register file. Otherwise its register file sits in the group folder and it is documented in the group's README; subcommands that share a workflow use one group-level `run<Group>.ts`.
- `shared/` holds presentation used by several command groups. A workflow wanted by several groups is either plumbing (an adapter) or a rule (core).

## Workflows

- Effects arrive as one `<Cmd>Effects` parameter, defined next to the workflow. Each port is as narrow as the workflow uses (`fetchUserId`, not the whole `IapiClient`). Add a port only where a test needs a fake.
- Never touch adapters, Node I/O, `process.env` or the clock directly: everything goes through `effects`.
- No domain decisions. Branch only to dispatch on what core returned, or to stop on an `err` or a cancelled prompt. Anything worth a table test belongs in core.
- Never write to stdout; the payload is returned and `run<Cmd>` prints it. Logging, prompts, spinners and notes are effects. Prompts go through `src/cli/adapters/prompts/prompts.ts`, which forces stderr; clack on its own writes to stdout.
- Pick the log level per message: `logger.info("standard", ...)` for progress the user should see, `"verbose"` for traces. `logger.error(...)` takes no level.
- Tested with in-memory fakes of the effects, never `vi.mock`.

## Run functions

- A `run<Cmd>` that logs starts with `const logger = createLoggerFromArgs(args)`; a payload-only one takes none.
- Resolving arguments into real inputs (the `--input` file, stdin) happens here, through adapters.

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
