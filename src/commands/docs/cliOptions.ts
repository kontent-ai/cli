import type { Argv } from "yargs";
import { API_REFERENCES } from "../../lib/learn/apiReference.js";

// The service ranks and returns at most this many results; the slice is client-side.
export const MAX_LIMIT = 10;

export type DocsOptions = Readonly<{ defaultLimit: number; isApiRequired: boolean }>;

export const withDocsOptions = <T, O extends DocsOptions>(b: Argv<T>, options: O) =>
  b
    .option("limit", {
      type: "number",
      default: options.defaultLimit,
      describe: `Maximum number of candidates to print (1-${MAX_LIMIT})`,
    })
    .check((args) =>
      Number.isInteger(args.limit) && args.limit >= 1 && args.limit <= MAX_LIMIT
        ? true
        : `--limit must be a whole number between 1 and ${MAX_LIMIT}.`,
    )
    .option("compact", {
      type: "boolean",
      default: false,
      describe: "Print the JSON on one line, no indentation",
    })
    .option("api", {
      type: "string",
      choices: API_REFERENCES,
      demandOption: options.isApiRequired,
      describe: "API reference to search in",
    } as const);
