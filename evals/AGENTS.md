# evals

- Agent-eval harness: Vitest plus the Agent SDK, `pnpm evals:run`, own `vitest.evals.config.ts`. The paid agent run never runs in `pnpm test` or CI; the harness unit tests in `test/` (helpers in `test/helpers/`) do run in `pnpm test`.
- Gated on `EVALS_MAPI_KEY`/`EVALS_SOURCE_ENV_ID`, which the CLI must never read.
- The agent gets Bash confined to a workspace dir, plus WebFetch limited to `kontent.ai` with key-in-URL denied. The policy is a pure reducer in `lib/policy.ts`; `lib/agent.ts` owns Agent SDK execution and wires the policy into the `PreToolUse` hook.
- Tool calls and denials come from the run's raw messages (`lib/toolCalls.ts`); CLI invocations and exit codes from the shim's per-task log (`lib/invocations.ts`), never from parsing shell text.
- One cloned environment shared by every task, run sequentially in dependency order; a task whose parent did not PASS is BLOCKED.
- `tasks/<id>/task.ts` holds the prompt and check. Checks are deterministic, return `Result` (a failed lookup is an `err`, never a failed assertion), and stay tolerant about names the task did not fix.
- Reports in `lib/report/` are markdown only, removable by deleting the folder and its call site. Playbook: `README.md`.
