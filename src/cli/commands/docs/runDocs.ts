import { match } from "ts-pattern";
import { err, flatMap, mapErr, ok, type Result } from "../../../core/lib/result.js";
import type { ApiReference } from "../../adapters/learn/apiReference.js";
import { createDocs, type Docs } from "../../adapters/learn/docs.js";
import type { EndpointDetails } from "../../adapters/learn/endpoints/endpointDetails.js";
import type { ObjectDetails } from "../../adapters/learn/endpoints/objectDetails.js";
import type { SearchResult } from "../../adapters/learn/endpoints/search.js";
import type { Telemetry } from "../../adapters/telemetry/tracking.js";
import { createLoggerFromArgs, type LogOptions } from "../../log.js";
import { formatDocsOutput } from "./formatOutput.js";

export type DocsEffects = Readonly<{ docs: Docs }>;

export type DocsQuery = Readonly<{
  query: string;
  limit: number;
  apiReference?: ApiReference;
}>;

/**
 * The service answers a query or it does not: a non-2xx carries no result worth
 * showing, so unlike `mapi` every failed status is an error rather than a value.
 */
export type DocsError =
  | Readonly<{ kind: "empty-query"; message: string }>
  | Readonly<{ kind: "no-match"; message: string }>
  | Readonly<{ kind: "request-failed"; message: string }>;

export const searchDocs = async (
  effects: DocsEffects,
  query: DocsQuery,
): Promise<Result<ReadonlyArray<SearchResult>, DocsError>> =>
  takeBest(
    await fetchCandidates(effects.docs.search, query),
    "page",
    query,
    searchAgainHint(query),
  );

export const getEndpointDetails = async (
  effects: DocsEffects,
  query: DocsQuery,
): Promise<Result<ReadonlyArray<EndpointDetails>, DocsError>> =>
  takeBest(
    await fetchCandidates(effects.docs.endpointDetails, query),
    "endpoint",
    query,
    runSearchHint(query),
  );

export const getObjectDetails = async (
  effects: DocsEffects,
  query: DocsQuery,
): Promise<Result<ReadonlyArray<ObjectDetails>, DocsError>> =>
  takeBest(
    await fetchCandidates(effects.docs.objectDetails, query),
    "object",
    query,
    runSearchHint(query),
  );

export const runDocs = async <T extends Readonly<Record<string, unknown>>>(
  commandName: string,
  args: LogOptions & Readonly<{ compact?: boolean }>,
  telemetry: Telemetry,
  lookUpDocs: (effects: DocsEffects) => Promise<Result<ReadonlyArray<T>, DocsError>>,
): Promise<void> => {
  const logger = createLoggerFromArgs(args);
  const tracker = telemetry.startCommandTracking(commandName, logger);

  const output = formatDocsOutput(
    await lookUpDocs({ docs: createDocs({ logger }) }),
    args.compact === true,
  );
  if (output.stdout !== "") {
    process.stdout.write(output.stdout);
  }
  if (output.error !== undefined) {
    logger.error(output.error);
  }
  match(output.telemetry)
    .with({ outcome: "succeed" }, () => tracker.succeed())
    .with({ outcome: "fail" }, ({ errorCode }) => tracker.fail(errorCode))
    .exhaustive();
  if (output.isFailure) {
    process.exitCode = 1;
  }
};

const fetchCandidates = async <T>(
  fetchFromDocs: (
    query: Readonly<{ text: string; apiReference?: ApiReference }>,
  ) => Promise<Result<T, string>>,
  query: DocsQuery,
): Promise<Result<T, DocsError>> => {
  const text = query.query.trim();
  if (text === "") {
    return err({
      kind: "empty-query",
      message:
        'A query is required. Pass a non-empty query, e.g. kontent docs search "upsert language variant".',
    });
  }
  return mapErr(
    await fetchFromDocs({
      text,
      ...(query.apiReference === undefined ? {} : { apiReference: query.apiReference }),
    }),
    (message): DocsError => ({ kind: "request-failed", message }),
  );
};

const takeBest = <T>(
  result: Result<ReadonlyArray<T>, DocsError>,
  subject: string,
  query: DocsQuery,
  hint: string,
): Result<ReadonlyArray<T>, DocsError> =>
  flatMap(result, (candidates) => {
    if (candidates.length === 0) {
      return err({
        kind: "no-match",
        message: `No ${subject} matches "${query.query}". ${hint}`,
      });
    }

    return ok(candidates.slice(0, query.limit));
  });

// search is the command an agent would otherwise be told to run for a no-match on
// search itself, so its hint points at dropping the filter instead of circling back.
const searchAgainHint = (query: DocsQuery): string =>
  query.apiReference === undefined
    ? "Try different wording."
    : "Try different wording, or drop --api to include conceptual guides.";

const runSearchHint = (query: DocsQuery): string =>
  `Try different wording, or run kontent docs search "${query.query}" to see what the docs cover.`;
