# src/core

- Orchestration of business logic. Use `Result` for recoverable failures and `Option` for optional values. Commands own presentation and exit codes.
- Operations receive `iapiClient`/`mapiClient` from the command, e.g. `performBootstrap(params, { logger, iapiClient, mapiClient })`. Core builds a client only where a fresh token first becomes one: `login/login.ts` and `iapi/authenticatedClient.ts`.
- Never writes to stdout or the console. The payload is returned as a value and the command prints it.
- Diagnostics go only through the passed `Logger` (a parameter, or inside `deps`), which writes to stderr.
- Pick the level per message: `logger.info("standard", ...)` for progress the user should see, `"verbose"` for traces. `logger.error(...)` takes no level.
- Exception: an inherently interactive flow may drive its own terminal UI, e.g. `project/bootstrap.ts`. Prompts, spinners and notes must go through the wrappers in `src/lib/ui/prompts.ts`: they force stderr, while clack on its own writes to stdout and breaks the output contract. Everything else stays free of direct writes.
