// Runs the CLI entry passed as the first argument (see createCliShim in
// evals/globalSetup.ts) and, when EVALS_INVOCATION_LOG is set, appends one JSON
// line per invocation. The key is redacted here because the agent's shell has
// already expanded "$EVALS_MAPI_KEY" into a plain string by the time argv arrives.
import { spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";

const [cliEntry, ...args] = process.argv.slice(2);
if (cliEntry === undefined) {
  process.stderr.write("evals shim: missing the CLI entry argument.\n");
  process.exit(1);
}

const result = spawnSync(process.execPath, [cliEntry, ...args], { stdio: "inherit" });
// null status means the child died from a signal; still a failure.
const exitCode = result.status ?? 1;

const logPath = process.env.EVALS_INVOCATION_LOG;
if (logPath !== undefined && logPath !== "") {
  const key = process.env.EVALS_MAPI_KEY;
  const redactedArgs =
    key === undefined || key === "" ? args : args.map((arg) => arg.split(key).join("<mapi-key>"));
  appendFileSync(logPath, `${JSON.stringify({ exitCode, args: redactedArgs })}\n`);
}

process.exit(exitCode);
