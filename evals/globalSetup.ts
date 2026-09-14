import { execFile } from "node:child_process";
import { chmod, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type { TestProject } from "vitest/node";
import { isErr } from "../src/lib/result.js";
import { cloneTestEnvironment, deleteTestEnvironment } from "../test/helpers/environment.js";
import { requireEvalsConfig } from "./lib/config.js";
import { createRunDirectory } from "./lib/results.js";

declare module "vitest" {
  interface ProvidedContext {
    evals: Readonly<{
      envId: string;
      cliBinDir: string;
      runDir: string;
      model: string;
      mapiKey: string;
    }>;
  }
}

const execFileAsync = promisify(execFile);
const repoRoot = fileURLToPath(new URL("..", import.meta.url));

// Runs once before evals/run.eval.ts: builds the CLI, clones the eval
// environment, and hands both to the test file via `inject("evals")`.
// Teardown deletes the clone unless EVALS_KEEP_ENV=1.
export const setup = async ({ provide }: TestProject): Promise<() => Promise<void>> => {
  failIfApiKeyIsSet();

  const config = requireEvalsConfig();
  if (isErr(config)) {
    throw new Error(config.error);
  }

  process.stderr.write("Building the CLI...\n");
  await execFileAsync("pnpm", ["build"], { cwd: repoRoot });

  const cliBinDir = await createCliShim();
  const model = readModel();
  const runDir = await createRunDirectory(join(repoRoot, "evals", "results"), model);

  process.stderr.write(`Cloning ${config.value.sourceEnvId}; this takes a while.\n`);
  const environment = await cloneTestEnvironment(config.value, "evals");
  process.stderr.write(`Cloned as ${environment.name} (${environment.envId}).\n`);

  // Anything past this point that throws must still delete the clone: there
  // is no returned teardown yet for Vitest to call on our behalf.
  try {
    provide("evals", {
      envId: environment.envId,
      cliBinDir,
      runDir,
      model,
      mapiKey: config.value.mapiKey,
    });
  } catch (cause) {
    await deleteTestEnvironment(config.value, environment.envId);
    throw cause;
  }

  return async () => {
    process.stderr.write(`Environment: ${environment.envId}. Run dir: ${runDir}\n`);
    if (process.env.EVALS_KEEP_ENV === "1") {
      process.stderr.write("EVALS_KEEP_ENV=1: leaving the environment in place.\n");
      return;
    }
    await deleteTestEnvironment(config.value, environment.envId);
    process.stderr.write(`Deleted environment ${environment.envId}.\n`);
  };
};

// Decision: evals authenticate as the operator's own local Claude Code
// subscription login, never an API key, so the CLI's cost stays on the
// operator's plan rather than an org's Console budget. EVALS_ALLOW_API_KEY=1
// is the deliberate escape hatch (e.g. a CI account that only has a key).
const failIfApiKeyIsSet = (): void => {
  const hasApiKey =
    process.env.ANTHROPIC_API_KEY !== undefined && process.env.ANTHROPIC_API_KEY !== "";
  if (hasApiKey && process.env.EVALS_ALLOW_API_KEY !== "1") {
    throw new Error(
      "ANTHROPIC_API_KEY is set. Evals run through your local Claude Code subscription login, not " +
        "an API key. Unset it, or set EVALS_ALLOW_API_KEY=1 to run with it anyway.",
    );
  }
};

const readModel = (): string => {
  const model = process.env.EVALS_MODEL;
  return model === undefined || model === "" ? "sonnet" : model;
};

// Creates a temp dir under the OS temp dir holding one executable bash script
// named `kontent` that execs `node <repo>/dist/index.mjs "$@"`. evals/lib/agent.ts
// prepends this dir to the agent's PATH, so `kontent` resolves to the build
// `pnpm build` just produced above, never a stale global install. Bash-only,
// so no Windows. The temp dir is not cleaned up.
const createCliShim = async (): Promise<string> => {
  const binDir = await mkdtemp(join(tmpdir(), "kontent-evals-bin-"));
  const shimPath = join(binDir, "kontent");
  await writeFile(
    shimPath,
    `#!/usr/bin/env bash\nexec node "${join(repoRoot, "dist", "index.mjs")}" "$@"\n`,
  );
  await chmod(shimPath, 0o755);
  return binDir;
};
