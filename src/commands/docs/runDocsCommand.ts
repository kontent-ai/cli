import type { DocsDeps, DocsError } from "../../core/docs/learn.js";
import { createLearnClient } from "../../lib/learn/client.js";
import { isErr, type Result } from "../../lib/result.js";
import type { Telemetry } from "../../lib/telemetry/tracking.js";
import { createLoggerFromArgs, type LogOptions } from "../../log.js";

export const runDocsCommand = async <T>(
  commandName: string,
  args: LogOptions,
  telemetry: Telemetry,
  run: (deps: DocsDeps) => Promise<Result<T, DocsError>>,
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

  process.stdout.write(`${JSON.stringify(result.value, null, 2)}\n`);
  tracker.succeed();
};
