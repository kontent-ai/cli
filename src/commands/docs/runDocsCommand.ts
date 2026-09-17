import type { DocsDeps, DocsError } from "../../core/docs/learn.js";
import { createLearnClient } from "../../lib/learn/client.js";
import { isErr, type Result } from "../../lib/result.js";
import type { Telemetry } from "../../lib/telemetry/tracking.js";
import { createLoggerFromArgs, type LogOptions } from "../../log.js";

export const runDocsCommand = async <T extends Readonly<Record<string, unknown>>>(
  commandName: string,
  args: LogOptions & Readonly<{ compact?: boolean }>,
  telemetry: Telemetry,
  run: (deps: DocsDeps) => Promise<Result<ReadonlyArray<T>, DocsError>>,
): Promise<void> => {
  const logger = createLoggerFromArgs(args);
  const tracker = telemetry.startCommandTracking(commandName, logger);

  const result = await run({ logger, client: createLearnClient() });
  if (isErr(result)) {
    tracker.fail(result.error.kind);
    logger.error(result.error.message);
    process.exitCode = 1;
    return;
  }

  const ordered = result.value.map(orderKeys);
  const payload =
    args.compact === true ? JSON.stringify(ordered) : JSON.stringify(ordered, null, 2);
  process.stdout.write(`${payload}\n`);
  tracker.succeed();
};

const PRIORITY_KEYS: ReadonlyArray<string> = [
  "httpMethod",
  "endpointUrls",
  "docsUrl",
  "title",
  "description",
  "usageCodeSamples",
];

const orderKeys = (candidate: Readonly<Record<string, unknown>>): Record<string, unknown> => {
  const priority = PRIORITY_KEYS.filter((key) => key in candidate).map(
    (key) => [key, candidate[key]] as const,
  );
  const rest = Object.entries(candidate).filter(([key]) => !PRIORITY_KEYS.includes(key));
  return Object.fromEntries([...priority, ...rest]);
};
