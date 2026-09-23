# Agent evals

Measures how far an AI agent, acting like a fresh human user, gets when it drives the built
`kontent` CLI against a real Kontent.ai environment. One Agent SDK run per task; deterministic
checks in `evals/tasks/<id>/task.ts` grade the resulting environment state afterwards. This agent
run goes through Vitest, but not as part of `pnpm test` or CI - it costs money and needs a cloned
environment, so it is a deliberate opt-in. The harness's own unit tests (`evals/test/`) are plain
Vitest specs and run as part of `pnpm test` like any other unit test.

## What the agent gets

Two tools, declared in `evals/lib/policy.ts` and wired into the SDK options by `evals/lib/agent.ts`,
enforced by the `PreToolUse` hook via the pure policy reducer in `evals/lib/policy.ts`:

- `Bash`, denied for any command referencing a path outside the task's workspace directory. This is
  a file-access guard, not a sandbox: Bash has full network access, and the agent is trusted with it.
- `WebFetch`, allowed for `kontent.ai` only (the API reference lives at `kontent.ai/learn/...`), and
  denied outright for a URL that contains the Management API key. The rule exists to measure, not to
  contain: every fetch is a fallback the CLI's own docs did not cover.

The preamble says nothing about the web or about `kontent docs`: which route the agent takes to the
API reference is part of what a run records (`docs` and `fetch` counts, and the report's "Web
fetches" section). Every fetch is a place where the CLI's own docs did not carry the agent.

## Preconditions

- `EVALS_MAPI_KEY` and `EVALS_SOURCE_ENV_ID` exported in your shell, or set in `.env`.
- Logged into Claude Code locally (`claude` on PATH, authenticated).
- `ANTHROPIC_API_KEY` unset. Evals authenticate as your local subscription login, not an API key -
  see [Anthropic policy](#anthropic-policy) below. The run fails fast if it is set, unless you pass
  `EVALS_ALLOW_API_KEY=1`.

## Run it

```
EVALS_MODEL=sonnet pnpm evals:run
```

`globalSetup.ts` builds the CLI (or installs it, see `EVALS_CLI_PACKAGE`), clones `EVALS_SOURCE_ENV_ID`, and hands the environment id and the
built CLI's bin directory to the test file. `evals/run.eval.ts` then runs every task exported from
`evals/lib/registry.ts`, in dependency order, sequentially, against that one environment: if any of
a task's parents did not PASS, the task is recorded BLOCKED and no agent is spawned for it. Teardown
deletes the cloned environment unless you keep it (see below).

### Environment variables

- `EVALS_MODEL` - model passed to the Agent SDK. Default `sonnet`.
- `EVALS_KEEP_ENV=1` - keep the cloned environment instead of deleting it at the end.
- `EVALS_ALLOW_API_KEY=1` - run even with `ANTHROPIC_API_KEY` set.
- `EVALS_CLI_PACKAGE` - npm package to evaluate instead of the local build, e.g.
  `@kontent-ai/cli@next` or `@kontent-ai/cli@0.10.0-beta.1`. Runs
  `npm install` into `$TMPDIR/kontent-evals-cli`, wiped at the start of each run.

## Output

Each run writes to `evals/results/<YYYY-MM-DD>-<HHMM>-<model>/` (git-ignored; date and time are UTC,
taken at the start of the run):

- `run.json` - header (model, tools, permission rules, max turns, CLI version, CLI package when set, git sha, environment
  id, preamble hash, timing) and one row per task (verdict, turns, tool call, failed, denied, help,
  docs and fetch counts, cost, duration, stop reason).
- `report.md` - the same summary as a table, plus a friction section (every failed call, every
  web fetch) and every task's final agent reply. Nice-to-have:
  `evals/lib/report/` renders it from the same data as `run.json`, with no LLM calls; deleting that
  folder and the one call into it from `evals/lib/results.ts` removes the feature cleanly.
- `tasks/<id>.json` - the task's full trace (tool calls and fetches, agent text, numbers) plus its
  verdict and assertions.
- `tasks/<id>.raw.jsonl` - every raw Agent SDK message for that task, one per line.
- `tasks/<id>.md` - the same task report rendered as markdown.
- `tasks/<id>.invocations` - one JSON line per `kontent` process the agent ran (exit code and
  argv, key redacted), the source of the `cli`, `failed`, `help` and `docs` columns.

Each task also gets its own workspace directory under the OS temp dir (`kontent-eval-<task>-*`),
where the agent runs its commands. These are left in place after the run, not cleaned up, so they
stay available for inspection.

## Adding a task

1. `evals/tasks/<id>/task.ts` - export an `EvalTask` with an `id`, its `dependsOn` (the ids of its
   parent tasks), a `prompt` phrased as a busy human would type it, with no hints about the CLI, and
   a `check` that reads the environment through the Management SDK and returns assertions. A failed
   lookup is an `err`, never a failed assertion. Codenames the prompt fixes are asserted exactly;
   names are never asserted; content items are named only and found by name. Include a regression
   assertion for anything an earlier task in the chain seeded.
2. Add its id to the `TaskId` union in `evals/lib/types.ts`.
3. Add it to `evals/lib/registry.ts`.
