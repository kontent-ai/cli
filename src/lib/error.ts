import { SharedModels } from "@kontent-ai/management-sdk";

export const errorMessage = (cause: unknown): string => describeChain(cause, new Set());

export const mapiErrorMessage = (cause: unknown): string => {
  if (!(cause instanceof SharedModels.ContentManagementBaseKontentError)) {
    return errorMessage(cause);
  }

  return JSON.stringify(
    {
      message: cause.message,
      errorCode: cause.errorCode,
      validationErrors: [...new Set(cause.validationErrors.map((error) => error.message))],
      requestId: cause.requestId,
      ...requestInfo(cause.originalError),
    },
    null,
    2,
  );
};

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

const requestInfo = (
  originalError: unknown,
): { method?: string; url?: string; status?: number } => {
  if (typeof originalError !== "object" || originalError === null) {
    return {};
  }
  const axiosError = originalError as {
    config?: { method?: string; url?: string };
    response?: { status?: number };
  };
  return {
    method: axiosError.config?.method?.toUpperCase(),
    url: axiosError.config?.url,
    status: axiosError.response?.status,
  };
};
