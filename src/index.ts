#!/usr/bin/env node

import chalk, { chalkStderr } from "chalk";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { commandsToRegister } from "./commands/registry.js";
import { getKontentBaseDomain, validateKontentDomain } from "./lib/config/kontentUrl.js";
import { isErr } from "./lib/result.js";
import { cliVersion } from "./lib/telemetry/context.js";
import {
  createTelemetry,
  formatTelemetryMode,
  registerTelemetrySignalFlush,
} from "./lib/telemetry/tracking.js";
import { addLogLevelOptions, createLoggerFromArgs } from "./log.js";
import type { CommandDeps } from "./types/yargs.js";

// A reader that stops early (`... | head`) exits and takes the read end of the
// pipe with it, while we are still writing. The write then fails with EPIPE and
// process.stdout emits 'error' - and an 'error' event with no listener is thrown
// by EventEmitter, so the CLI dies with a stack trace instead of the payload.
// Attaching any listener is the fix; the code check only keeps real failures
// loud. process.exitCode stays the command's to set.
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
// Each variable is read where it is used instead (lib/config/kontentUrl.ts,
// lib/auth/config.ts, lib/telemetry/consent.ts, commands/mapi/request.ts).
const initialYargs = emptyYargs
  .wrap(emptyYargs.terminalWidth())
  .scriptName("kontent")
  .epilogue("Docs: https://kontent.ai/learn  |  Contact: devrel@kontent.ai")
  .demandCommand(1, chalk.red("You need to provide a command to run."))
  .strict()
  .config("configFile", "Path to a JSON file with CLI parameters.")
  .help("h")
  .alias("h", "help")
  .version(cliVersion)
  .alias("v", "version");

const withLogLevel = addLogLevelOptions(initialYargs);

const kontentDomainResult = validateKontentDomain(getKontentBaseDomain());
if (isErr(kontentDomainResult)) {
  console.error(`${chalkStderr.red("Error:")} ${kontentDomainResult.error}`);
  process.exit(1);
}

const { telemetry, mode } = await createTelemetry();
const deps: CommandDeps = { telemetry };
registerTelemetrySignalFlush(telemetry);

// Runs after parsing (so --verbose is known) and before the command handler.
const withTelemetryModeLog = withLogLevel.middleware((args) => {
  createLoggerFromArgs(args).info("verbose", formatTelemetryMode(mode));
});

await commandsToRegister
  .reduce((current, register) => register(current, deps), withTelemetryModeLog)
  .parseAsync();

await telemetry.flush();
