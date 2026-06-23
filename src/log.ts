import chalk from "chalk";
import type { Argv } from "yargs";

export type LogLevel = "none" | "standard" | "verbose";

const logLevelsPriority: Readonly<Record<LogLevel, number>> = {
  none: 0,
  standard: 10,
  verbose: 20,
};

export const allLogLevels = Object.keys(logLevelsPriority);

type LoggableLogLevel = Exclude<LogLevel, "none">;

const defaultLogLevel: LogLevel = "standard";

export type LogOptions = Readonly<{
  logLevel?: string;
  verbose?: boolean;
}>;

export const addLogLevelOptions = <PreviousOptions>(
  inputYargs: Argv<PreviousOptions>,
): Argv<PreviousOptions & LogOptions> =>
  inputYargs
    .option("logLevel", {
      type: "string",
      choices: allLogLevels,
      alias: "ll",
      describe: `Set the level of details printed. (default: ${defaultLogLevel})`,
    })
    .option("verbose", {
      type: "boolean",
      describe: "Set the log level to verbose. (alias for --logLevel=verbose)",
      conflicts: "logLevel",
    });

export const logError = (options: LogOptions, ...messages: ReadonlyArray<string>) =>
  logInternal(
    options,
    "standard",
    console.error,
    ...messages.map((m) => `${chalk.red("Error:")} ${m}\n`),
  );

export const logWarning = (
  options: LogOptions,
  logAtLevel: LoggableLogLevel,
  ...messages: ReadonlyArray<string>
) => logInternal(options, logAtLevel, console.warn, ...messages);

export const logInfo = (
  options: LogOptions,
  logAtLevel: LoggableLogLevel,
  ...messages: ReadonlyArray<string>
) => logInternal(options, logAtLevel, console.log, ...messages);

const logInternal = (
  options: LogOptions,
  thisMessageLogLevel: LoggableLogLevel,
  logFnc: (...msgs: ReadonlyArray<string>) => void,
  ...messages: ReadonlyArray<string>
) => {
  if (logLevelsPriority[optionsToLogLevel(options)] >= logLevelsPriority[thisMessageLogLevel]) {
    logFnc(...messages);
  }
};

export const isVerbose = (options: LogOptions): boolean => optionsToLogLevel(options) === "verbose";

const optionsToLogLevel = (options: LogOptions): LogLevel => {
  if (options.verbose) {
    return "verbose";
  }
  const logLevel = options.logLevel ?? defaultLogLevel;
  if (!isLogLevel(logLevel)) {
    throw new Error(`CLI argument parsing error: log level "${options.logLevel}" is not valid.`);
  }
  return logLevel;
};

const isLogLevel = (input: string): input is LogLevel => allLogLevels.includes(input);
