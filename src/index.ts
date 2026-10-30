#!/usr/bin/env node

import chalk, { chalkStderr } from "chalk";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { cliConfigStore } from "./cli/adapters/config/cliConfig.js";
import { cliVersion } from "./cli/adapters/telemetry/context.js";
import {
  createTelemetry,
  formatTelemetryMode,
  registerTelemetrySignalFlush,
} from "./cli/adapters/telemetry/tracking.js";
import { commandsToRegister } from "./cli/commands/registry.js";
import { addLogLevelOptions, createLoggerFromArgs } from "./cli/log.js";
import type { CommandDeps } from "./cli/types/yargs.js";
import { resolveKontentTarget } from "./core/kontentUrl/kontentUrl.js";
import { isErr } from "./core/lib/result.js";

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
// Each variable is read where it is used instead (KONTENT_URL below,
// cli/adapters/auth/config.ts, cli/adapters/telemetry/consent.ts,
// cli/commands/mapi/request/runRequest.ts).
const initialYargs = emptyYargs
  .wrap(emptyYargs.terminalWidth())
  .scriptName("kontent")
  .locale("en")
  .epilogue("Docs: https://kontent.ai/learn  |  Contact: devrel@kontent.ai")
  .demandCommand(1, chalk.red("You need to provide a command to run."))
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
  console.error(`${chalkStderr.red("Error:")} ${kontentTarget.error}`);
  process.exit(1);
}

const { telemetry, mode } = await createTelemetry({ config: cliConfigStore });
const deps: CommandDeps = { telemetry, kontentTarget: kontentTarget.value };
registerTelemetrySignalFlush(telemetry);

// Runs after parsing (so --verbose is known) and before the command handler.
const withTelemetryModeLog = withLogLevel.middleware((args) => {
  createLoggerFromArgs(args).info("verbose", formatTelemetryMode(mode));
});

await commandsToRegister
  .reduce((current, register) => register(current, deps), withTelemetryModeLog)
  .parseAsync();

await telemetry.flush();
