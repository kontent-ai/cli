import { SharedModels } from "@kontent-ai/management-sdk";

export const errorMessage = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

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
