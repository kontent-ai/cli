import { isErr, type Result } from "../../../core/lib/result.js";
import type { CommandOutcome } from "../shared/commandOutcome.js";
import type { DocsError } from "./runDocs.js";

export type DocsOutput = Readonly<{
  stdout: string;
  error: string | undefined;
  outcome: CommandOutcome;
}>;

/** Everything a docs command writes, decided as data so the streams can be asserted on. */
export const formatDocsOutput = (
  result: Result<ReadonlyArray<Readonly<Record<string, unknown>>>, DocsError>,
  isCompact: boolean,
): DocsOutput => {
  if (isErr(result)) {
    return {
      stdout: "",
      error: result.error.message,
      outcome: { status: "error", reason: "failure", errorCode: result.error.kind },
    };
  }

  const ordered = result.value.map(orderKeys);
  const payload = isCompact ? JSON.stringify(ordered) : JSON.stringify(ordered, null, 2);
  return {
    stdout: `${payload}\n`,
    error: undefined,
    outcome: { status: "success" },
  };
};

const PRIORITY_KEYS: ReadonlyArray<string> = [
  "httpMethod",
  "endpointUrls",
  "docsUrl",
  "title",
  "description",
  "usageCodeSamples",
];

const orderKeys = (
  candidate: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> => {
  const priority = PRIORITY_KEYS.filter((key) => key in candidate).map(
    (key) => [key, candidate[key]] as const,
  );
  const rest = Object.entries(candidate).filter(([key]) => !PRIORITY_KEYS.includes(key));
  return Object.fromEntries([...priority, ...rest]);
};
