import { SharedModels } from "@kontent-ai/management-sdk";
import { errorMessage } from "../error.js";

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

// The SDK wraps an HTTP failure only when its body carries a MAPI error code or request id;
// otherwise it rethrows the axios error itself, which still holds the response status.
export const mapiErrorStatus = (cause: unknown): number | undefined =>
  requestInfo(
    cause instanceof SharedModels.ContentManagementBaseKontentError ? cause.originalError : cause,
  ).status;

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
