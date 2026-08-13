#!/usr/bin/env node

import chalk, { chalkStderr } from "chalk";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { getKontentBaseDomain, validateKontentDomain } from "./lib/config/kontentUrl.js";
import { isErr } from "./lib/result.js";
import {
  createTelemetry,
  formatTelemetryMode,
  registerTelemetrySignalFlush,
} from "./lib/telemetry/tracking.js";
import { addLogLevelOptions, createLoggerFromArgs } from "./log.js";
import type { CommandDeps, RegisterCommand } from "./types/yargs.js";

const commandsToRegister: ReadonlyArray<RegisterCommand> = [
  (await import("./commands/login/login.js")).register,
  (await import("./commands/logout/logout.js")).register,
  (await import("./commands/project/project.js")).register,
  (await import("./commands/telemetry/telemetry.js")).register,
];

const emptyYargs = yargs(hideBin(process.argv));

const initialYargs = emptyYargs
  .wrap(emptyYargs.terminalWidth())
  .env("KONTENT")
  .scriptName("kontent")
  .epilogue("Docs: https://kontent.ai/learn  |  Contact: devrel@kontent.ai")
  .demandCommand(1, chalk.red("You need to provide a command to run."))
  .strict()
  .config("configFile", "Path to a JSON file with CLI parameters.")
  .help("h")
  .alias("h", "help")
  .alias("v", "version");

const withLogLevel = addLogLevelOptions(initialYargs);

// Hidden options exist only so .strict() + .env("KONTENT") accept the
// KONTENT_* env vars; the resolvers read process.env directly. The auth0* ones
// are a developer escape hatch for pointing the CLI at a non-default tenant
// (e.g. QA) via KONTENT_AUTH0_* env vars.
const withHiddenEnvOptions = withLogLevel
  .option("doNotTrack", { type: "boolean", hidden: true })
  .option("telemetryDebug", { type: "boolean", hidden: true })
  .option("url", { type: "string", hidden: true })
  .option("auth0Domain", { type: "string", hidden: true })
  .option("auth0ClientId", { type: "string", hidden: true })
  .option("auth0Audience", { type: "string", hidden: true });

const kontentDomainResult = validateKontentDomain(getKontentBaseDomain());
if (isErr(kontentDomainResult)) {
  console.error(`${chalkStderr.red("Error:")} ${kontentDomainResult.error}`);
  process.exit(1);
}

const { telemetry, mode } = await createTelemetry();
const deps: CommandDeps = { telemetry };
registerTelemetrySignalFlush(telemetry);

// Runs after parsing (so --verbose is known) and before the command handler.
const withTelemetryModeLog = withHiddenEnvOptions.middleware((args) => {
  createLoggerFromArgs(args).info("verbose", formatTelemetryMode(mode));
});

await commandsToRegister
  .reduce((current, register) => register(current, deps), withTelemetryModeLog)
  .parseAsync();

await telemetry.flush();
