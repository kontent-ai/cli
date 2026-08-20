#!/usr/bin/env node

import chalk, { chalkStderr } from "chalk";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { commandsToRegister } from "./commands/registry.js";
import { getKontentBaseDomain, validateKontentDomain } from "./lib/config/kontentUrl.js";
import { isErr } from "./lib/result.js";
import {
  createTelemetry,
  formatTelemetryMode,
  registerTelemetrySignalFlush,
} from "./lib/telemetry/tracking.js";
import { addLogLevelOptions, createLoggerFromArgs } from "./log.js";
import type { CommandDeps } from "./types/yargs.js";

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
