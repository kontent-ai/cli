import { HttpService } from "@kontent-ai/core-sdk-v10";
import { createManagementClient, type ManagementClient } from "@kontent-ai/management-sdk";

export type MapiClient = ManagementClient;

const REQUEST_TIMEOUT_MS = 30_000;

// The axios timeout error carries this message, which `mapiErrorMessage` prints as is.
export const mapiAxiosRequestConfig = {
  timeout: REQUEST_TIMEOUT_MS,
  timeoutErrorMessage: `Request timed out after ${REQUEST_TIMEOUT_MS / 1000} s.`,
} as const;

/**
 * core-sdk v10's default rule resends 408, 429, 500, 502, 503 and 504 for any method, and
 * never a timeout or a lost connection. That is safe because every write this client makes
 * is a replace or carries a codename, so a resend cannot create a duplicate; a write with
 * neither needs its own rule. `maxAttempts` counts retries, not sends: at most 3 sends.
 */
export const mapiRetryStrategy = { maxAttempts: 2 } as const;

export const createMapiClient = ({
  token,
  envId,
  baseUrl,
}: {
  readonly token: string;
  readonly envId: string;
  readonly baseUrl: string;
}): MapiClient =>
  createManagementClient({
    environmentId: envId,
    apiKey: token,
    baseUrl,
    httpService: new HttpService({
      logErrorsToConsole: false,
      axiosRequestConfig: mapiAxiosRequestConfig,
    }),
    retryStrategy: mapiRetryStrategy,
  });
