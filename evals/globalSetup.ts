import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type { TestProject } from "vitest/node";
import { kontentManagementUrl } from "../src/lib/config/kontentUrl.js";
import { isErr, tryAsync } from "../src/lib/result.js";
import { cloneTestEnvironment, deleteTestEnvironment } from "../test/helpers/environment.js";
import { requireEvalsConfig } from "./lib/config.js";
import { createRunDirectory } from "./lib/results.js";

declare module "vitest" {
  interface ProvidedContext {
    evals: Readonly<{
      envId: string;
      cliBinDir: string;
      cliEntry: string;
      // The EVALS_CLI_PACKAGE npm spec; undefined when the run uses the local build.
      cliPackage: string | undefined;
      runDir: string;
      // A CLI config dir seeded with envId; each task runs on its own copy.
      configTemplateDir: string;
      model: string;
      mapiKey: string;
    }>;
  }
}

const execFileAsync = promisify(execFile);
const repoRoot = fileURLToPath(new URL("..", import.meta.url));

// Runs once before evals/run.eval.ts: builds (or installs) the CLI, clones the eval
// environment, and hands both to the test file via `inject("evals")`.
// Teardown deletes the clone unless EVALS_KEEP_ENV=1.
export const setup = async ({ provide }: TestProject): Promise<() => Promise<void>> => {
  failIfApiKeyIsSet();

  const config = requireEvalsConfig();
  if (isErr(config)) {
    throw new Error(config.error);
  }

  const cliPackage = readCliPackage();
  const cliEntry =
    cliPackage === undefined ? await buildLocalCli() : await installCliPackage(cliPackage);
  const cliBinDir = await createCliShim(cliEntry);
  process.stderr.write(`Target: ${kontentManagementUrl()} | CLI: ${cliPackage ?? "local build"}\n`);
  const model = readModel();
  const runDir = await createRunDirectory(join(repoRoot, "evals", "results"), model);

  process.stderr.write(`Cloning ${config.value.sourceEnvId}; this takes a while.\n`);
  const environment = await cloneTestEnvironment(config.value, "evals");
  process.stderr.write(`Cloned as ${environment.name} (${environment.envId}).\n`);

  // Anything past this point that throws must still delete the clone: there
  // is no returned teardown yet for Vitest to call on our behalf.
  try {
    const configTemplateDir = await seedConfigTemplate(environment.envId);
    await probeDefaultEnvironment({
      cliEntry,
      cliPackage,
      configTemplateDir,
      envId: environment.envId,
    });
    provide("evals", {
      envId: environment.envId,
      cliBinDir,
      cliEntry,
      cliPackage,
      runDir,
      configTemplateDir,
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

const readCliPackage = (): string | undefined => {
  const spec = process.env.EVALS_CLI_PACKAGE;
  return spec === undefined || spec === "" ? undefined : spec;
};

const buildLocalCli = async (): Promise<string> => {
  process.stderr.write("Building the CLI...\n");
  await execFileAsync("pnpm", ["build"], { cwd: repoRoot });
  return join(repoRoot, "dist", "index.mjs");
};

// Fixed and wiped at the start of each run, not in teardown: Vitest exits on
// Ctrl+C without running teardown, so a per-run dir would leak a full install
// every time. Outside the repo so that a dependency the package forgot to
// declare cannot resolve from the repo's own node_modules.
const cliInstallDir = join(tmpdir(), "kontent-evals-cli");

const installCliPackage = async (spec: string): Promise<string> => {
  process.stderr.write(`Installing ${spec} into ${cliInstallDir}...\n`);
  await rm(cliInstallDir, { recursive: true, force: true });
  await execFileAsync("npm", [
    "install",
    "--prefix",
    cliInstallDir,
    "--no-audit",
    "--no-fund",
    spec,
  ]);
  return realpath(join(cliInstallDir, "node_modules", ".bin", "kontent"));
};

const readModel = (): string => {
  const model = process.env.EVALS_MODEL;
  return model === undefined || model === "" ? "sonnet" : model;
};

// Creates a temp dir under the OS temp dir holding one executable bash script
// named `kontent`. evals/lib/agent.ts prepends this dir to the agent's PATH,
// so `kontent` resolves to `cliEntry`, never a stale global install. The
// script defers to evals/shim.ts, which runs the entry and, when
// $EVALS_INVOCATION_LOG is set, also writes the invocation log (see
// evals/lib/invocations.ts). The entry travels as the shim's first argument
// because the agent's env allowlist would drop an env var. Bash-only, so no
// Windows. The temp dir is not cleaned up.
const createCliShim = async (cliEntry: string): Promise<string> => {
  const binDir = await mkdtemp(join(tmpdir(), "kontent-evals-bin-"));
  const shimPath = join(binDir, "kontent");
  await writeFile(
    shimPath,
    `#!/usr/bin/env bash
exec node "${join(repoRoot, "evals", "shim.ts")}" "${cliEntry}" "$@"
`,
  );
  await chmod(shimPath, 0o755);
  return binDir;
};

// Written directly rather than through `kontent environment use`: `use` would verify the id
// with the operator's machine-wide keychain login, which the harness must not depend on. The
// probe below proves the CLI under test reads it. The path mirrors getCliConfigPath.
const seedConfigTemplate = async (envId: string): Promise<string> => {
  const templateDir = await mkdtemp(join(tmpdir(), "kontent-evals-config-"));
  const configPath = join(templateDir, "kontent", "cli", "config.json");
  const config = { envId, telemetryNoticeShown: true, telemetryEnabled: false };
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
  return templateDir;
};

// Runs the entry directly rather than through the shim, so the probe stays out of the
// invocation logs. An explicit env, never a spread of process.env, so harness credentials
// cannot leak into the CLI.
const probeDefaultEnvironment = async (
  params: Readonly<{
    cliEntry: string;
    cliPackage: string | undefined;
    configTemplateDir: string;
    envId: string;
  }>,
): Promise<void> => {
  const probe = await tryAsync(
    () =>
      execFileAsync(process.execPath, [params.cliEntry, "environment", "current"], {
        env: {
          PATH: process.env.PATH,
          HOME: process.env.HOME,
          TMPDIR: process.env.TMPDIR,
          XDG_CONFIG_HOME: params.configTemplateDir,
        },
      }),
    (cause): Readonly<{ stdout: string; stderr: string }> => {
      const failed = cause as { stdout?: string; stderr?: string };
      return { stdout: failed.stdout ?? "", stderr: failed.stderr ?? String(cause) };
    },
  );
  const output = isErr(probe) ? probe.error : probe.value;
  if (isErr(probe) || output.stdout.trim() !== params.envId) {
    throw new Error(
      `The CLI under test (${params.cliPackage ?? "local build"}) cannot read a default ` +
        "environment; EVALS_CLI_PACKAGE must be a version that ships `kontent environment`.\n" +
        `\`kontent environment current\` stderr:\n${output.stderr}\nstdout:\n${output.stdout}`,
    );
  }
};
