export const errorMessage = (cause: unknown): string => describeChain(cause, new Set());

// undici reports every transport failure as a bare "fetch failed" and puts the
// reason (ENOTFOUND, ECONNREFUSED, a TLS failure) in `cause`, so the message the
// user can act on is always one or more links down the chain.
const describeChain = (cause: unknown, seen: ReadonlySet<Error>): string => {
  if (!(cause instanceof Error)) {
    return String(cause);
  }

  // A cause chain may loop back on itself; report the message and stop.
  if (seen.has(cause)) {
    return cause.message;
  }

  return joinParts([cause.message, reasonOf(cause, new Set([...seen, cause]))]);
};

// A refused connection arrives as an AggregateError with an empty message and its
// reasons - one per address tried - in `errors` rather than in `cause`.
const reasonOf = (error: Error, seen: ReadonlySet<Error>): string => {
  if (error instanceof AggregateError) {
    return unique(error.errors.map((nested: unknown) => describeChain(nested, seen))).join(", ");
  }

  if (error.cause === undefined || error.cause === null) {
    return "";
  }

  return describeChain(error.cause, seen);
};

const unique = (parts: ReadonlyArray<string>): ReadonlyArray<string> => [...new Set(parts)];

const joinParts = (parts: ReadonlyArray<string>): string =>
  parts.filter((part) => part !== "").join(": ");
