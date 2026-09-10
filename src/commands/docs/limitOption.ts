import type { Argv } from "yargs";

// The service ranks and returns at most this many results; the slice is client-side.
export const MAX_LIMIT = 10;

export const withLimitOption = <T>(b: Argv<T>, defaultLimit: number) =>
  b
    .option("limit", {
      type: "number",
      default: defaultLimit,
      describe: `Maximum number of candidates to print (1-${MAX_LIMIT})`,
    })
    .check((args) =>
      Number.isInteger(args.limit) && args.limit >= 1 && args.limit <= MAX_LIMIT
        ? true
        : `--limit must be a whole number between 1 and ${MAX_LIMIT}.`,
    )
