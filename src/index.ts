#!/usr/bin/env node

import { isCI } from "ci-info";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { systemClock } from "./cli/adapters/clock/clock.js";
import { cliConfigStore } from "./cli/adapters/config/cliConfig.js";
import { isTelemetryDebug, readOptOutVariables } from "./cli/adapters/telemetry/consent.js";
import { amplitudeApiKey, cliVersion } from "./cli/adapters/telemetry/context.js";
import { systemIdentityEffects } from "./cli/adapters/telemetry/identity.js";
import { createAmplitudeSink } from "./cli/adapters/telemetry/sink.js";
import {
  createTelemetry,
  registerTelemetrySignalFlush,
} from "./cli/adapters/telemetry/tracking.js";
import { commandsToRegister } from "./cli/commands/registry.js";
import { EXIT_CODES } from "./cli/commands/shared/exitCodes.js";
import { summarizeUnexpectedError } from "./cli/commands/shared/runCommand.js";
import { usageHint } from "./cli/commands/shared/usageHint.js";
import { addLogLevelOptions, styleStderr } from "./cli/log.js";
import type { CommandDeps } from "./cli/types/yargs.js";
import { resolveKontentTarget } from "./core/kontentUrl/kontentUrl.js";
import { isErr } from "./core/lib/result.js";

// A reader that stops early (`... | head`) exits and takes the read end of the
// pipe with it, while we are still writing. The write then fails with EPIPE and
// process.stdout emits 'error' - and an 'error' event with no listener is thrown
// by EventEmitter, so the CLI dies with a stack trace instead of the payload.
// Attaching any listener is the fix; the code check only keeps real failures
// loud. The listener leaves process.exitCode alone: runCommand sets it from the
// command's outcome, the parse catch below on a usage error or a crash outside a command.
const ignoreClosedPipe = (stream: NodeJS.WriteStream): void => {
  stream.on("error", (error: NodeJS.ErrnoException) => {
    // Same closed pipe, one step later: once the stream is torn down the write is
    // rejected rather than attempted.
    if (error.code !== "EPIPE" && error.code !== "ERR_STREAM_DESTROYED") {
      // Node prints the resulting uncaught exception to stderr - visible when stdout
      // broke, lost when stderr is the stream that broke.
      throw error;
    }
  });
};

ignoreClosedPipe(process.stdout);
ignoreClosedPipe(process.stderr);

const emptyYargs = yargs(hideBin(process.argv));

// Deliberately no .env() prefix mapping: it turns every KONTENT_* variable in
// the shell into a flag, and .strict() then rejects the ones a given command
// does not declare - an unrelated KONTENT_PROJECT_ID would break the whole CLI.
// Each variable is read where it is used instead (KONTENT_URL below,
// cli/adapters/auth/config.ts, cli/adapters/telemetry/consent.ts,
// cli/commands/mapi/request/runRequest.ts, cli/commands/dapi/request/runRequest.ts).
const initialYargs = emptyYargs
  .wrap(emptyYargs.terminalWidth())
  .scriptName("kontent")
  .locale("en")
  .epilogue("Docs: https://kontent.ai/learn  |  Contact: devrel@kontent.ai")
  .demandCommand(1, styleStderr("red", "You need to provide a command to run."))
  .strict()
  .config("configFile", "Path to a JSON file with CLI parameters.")
  .help("h")
  .alias("h", "help")
  .version(cliVersion)
  .alias("v", "version");

const withLogLevel = addLogLevelOptions(initialYargs);

// Baked at build time by tsdown from KONTENT_URL; "" when unset. typeof guards the
// undeclared case (tsx).
declare const __KONTENT_URL__: string | undefined;

const kontentTarget = resolveKontentTarget({
  fromEnv: process.env.KONTENT_URL,
  baked:
    typeof __KONTENT_URL__ === "string" && __KONTENT_URL__ !== "" ? __KONTENT_URL__ : undefined,
});
if (isErr(kontentTarget)) {
  console.error(`${styleStderr("red", "Error:")} ${kontentTarget.error}`);
  process.exit(1);
}

const { telemetry } = await createTelemetry({
  config: cliConfigStore,
  clock: systemClock,
  identity: systemIdentityEffects(),
  optOutVariables: readOptOutVariables(process.env),
  isCiRun: isCI,
  isDebug: isTelemetryDebug(process.env),
  amplitudeApiKey,
  createSink: createAmplitudeSink,
});
const deps: CommandDeps = { telemetry, kontentTarget: kontentTarget.value };
registerTelemetrySignalFlush(telemetry);

const isReported = (error: unknown): boolean => error instanceof Error && "wasReported" in error;

const cli = commandsToRegister
  .reduce((current, register) => register(current, deps), withLogLevel)
  // Replaces the full help yargs prints on a usage error. It has to throw: yargs runs the
  // command once the handler returns. A throw from inside a .check() comes back in here,
  // so the error is marked as reported rather than printed twice.
  .fail((message: string | null, error: unknown) => {
    if (message === null || isReported(error)) {
      throw error;
    }
    console.error(`${styleStderr("red", "Error:")} ${message}\n${usageHint(cli)}`);
    throw Object.assign(new Error(message), { wasReported: true });
  });

// parseAsync throws synchronously on a usage error rather than rejecting, hence the .then.
await Promise.resolve()
  .then(async () => cli.parseAsync())
  .catch((error: unknown) => {
    if (!isReported(error)) {
      console.error(`${styleStderr("red", "Error:")} ${summarizeUnexpectedError(error)}`);
    }
    process.exitCode = EXIT_CODES.failure;
  });

await telemetry.flush();
