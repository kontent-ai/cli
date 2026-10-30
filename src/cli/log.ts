import type { Writable } from "node:stream";
import { chalkStderr } from "chalk";
import type { Argv } from "yargs";

export const ALL_LOG_LEVELS = ["none", "standard", "verbose"] as const;

export type LogLevel = (typeof ALL_LOG_LEVELS)[number];

export type MessageLevel = Exclude<LogLevel, "none">;

export type LogOptions = Readonly<{
  logLevel?: LogLevel;
  verbose?: boolean;
}>;

export type Logger = Readonly<{
  info: (logAtLevel: MessageLevel, ...messages: ReadonlyArray<string>) => void;
  warning: (logAtLevel: MessageLevel, ...messages: ReadonlyArray<string>) => void;
  error: (...messages: ReadonlyArray<string>) => void;
  isVerbose: boolean;
}>;

export const addLogLevelOptions = <PreviousOptions>(
  inputYargs: Argv<PreviousOptions>,
): Argv<PreviousOptions & LogOptions> =>
  inputYargs
    .option("logLevel", {
      type: "string",
      choices: ALL_LOG_LEVELS,
      alias: "ll",
      describe: `Set the level of details printed. (default: ${DEFAULT_LOG_LEVEL})`,
    })
    .option("verbose", {
      type: "boolean",
      describe: "Set the log level to verbose. (alias for --logLevel=verbose)",
      conflicts: "logLevel",
    });

/**
 * All output goes to stderr: stdout is reserved for command payloads, so a piped
 * response body never carries diagnostics. `sink` exists so tests can capture
 * output - it is not a routing knob.
 */
export const createLogger = (verbosity: LogLevel, sink: Writable = process.stderr): Logger => {
  const write = (logAtLevel: MessageLevel, messages: ReadonlyArray<string>): void => {
    if (logLevelsPriority[verbosity] < logLevelsPriority[logAtLevel]) {
      return;
    }
    sink.write(`${messages.join(" ")}\n`);
  };

  return {
    info: (logAtLevel, ...messages) => write(logAtLevel, messages),
    warning: (logAtLevel, ...messages) =>
      write(
        logAtLevel,
        messages.map((message) => `${chalkStderr.yellow("Warning:")} ${message}`),
      ),
    error: (...messages) =>
      write(
        "standard",
        messages.map((message) => `${chalkStderr.red("Error:")} ${message}`),
      ),
    isVerbose: verbosity === "verbose",
  };
};

export const createLoggerFromArgs = (args: LogOptions, sink?: Writable): Logger =>
  createLogger(argsToVerbosity(args), sink);

const logLevelsPriority: Readonly<Record<LogLevel, number>> = {
  none: 0,
  standard: 10,
  verbose: 20,
};

const DEFAULT_LOG_LEVEL: LogLevel = "standard";

// `--verbose` and `--logLevel` are mutually exclusive at the parser level, so the
// precedence only matters for callers that build LogOptions by hand.
const argsToVerbosity = (args: LogOptions): LogLevel => {
  if (args.verbose) {
    return "verbose";
  }
  return args.logLevel ?? DEFAULT_LOG_LEVEL;
};
