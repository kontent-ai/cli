// Runs the built CLI and, when EVALS_INVOCATION_LOG is set, appends one JSON
// line per invocation. The key is redacted here because the agent's shell has
// already expanded "$EVALS_MAPI_KEY" into a plain string by the time argv arrives.
import { spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const distPath = fileURLToPath(new URL("../dist/index.mjs", import.meta.url));
const args = process.argv.slice(2);

const result = spawnSync(process.execPath, [distPath, ...args], { stdio: "inherit" });
// null status means the child died from a signal; still a failure.
const exitCode = result.status ?? 1;

const logPath = process.env.EVALS_INVOCATION_LOG;
if (logPath !== undefined && logPath !== "") {
  const key = process.env.EVALS_MAPI_KEY;
  const redactedArgs = args.map((arg) => (key !== undefined && arg === key ? "<mapi-key>" : arg));
  appendFileSync(logPath, `${JSON.stringify({ exitCode, args: redactedArgs })}\n`);
}

process.exit(exitCode);
