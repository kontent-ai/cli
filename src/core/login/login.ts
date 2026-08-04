import { once } from "node:events";
import open from "open";
import { match } from "ts-pattern";
import { type Auth0Config, getAuth0Config } from "../../lib/auth/config.js";
import { type DeviceFlowDeps, loginViaDeviceFlow } from "../../lib/auth/deviceFlow.js";
import { formatAuthError } from "../../lib/auth/formatAuthError.js";
import { logVerboseAuthInfo } from "../../lib/auth/logVerboseAuthInfo.js";
import { createKeyringStorage, type TokenStorage } from "../../lib/auth/storage.js";
import { decideAuth, refreshOrClear } from "../../lib/auth/tokenAccess.js";
import type { AuthError, TokenSet } from "../../lib/auth/types.js";
import { errorMessage } from "../../lib/error.js";
import { createIapiClient } from "../../lib/iapi/client.js";
import { err, isErr, isOk, ok, type Result } from "../../lib/result.js";
import { type LogOptions, logInfo, logWarning } from "../../log.js";
import { ensureUserIdCached } from "../user/user.js";

export type LoginParams = LogOptions;

export type LoginOutcome = Readonly<{
  isAlreadyAuthenticated: boolean;
  identifier: string | null;
}>;

export const performLogin = async (
  params: LoginParams,
): Promise<Result<LoginOutcome, AuthError>> => {
  const config = getAuth0Config();
  const storage = createKeyringStorage();

  const stored = await storage.read();
  if (isErr(stored)) {
    logWarning(params, "verbose", formatAuthError(stored.error));
  }
  const storedTokens = isOk(stored) ? stored.value : null;

  const decision = decideAuth(storedTokens, Date.now());

  return match(decision)
    .with({ type: "use-existing-token" }, async () => {
      if (storedTokens !== null) {
        await ensureUserIdCached(params, {
          client: createIapiClient({ token: storedTokens.accessToken }),
        });
      }
      return ok({ isAlreadyAuthenticated: true, identifier: identifierFromTokens(storedTokens) });
    })
    .with({ type: "refresh-token" }, async ({ refreshToken }) => {
      const refreshed = await refreshOrClear(storage, config, refreshToken);
      if (isErr(refreshed)) {
        if (refreshed.error.kind !== "refresh-rejected") {
          // Transient failure (network, Auth0 down): the device flow would die
          // at the same place, so surface the error and keep the stored session.
          return err(refreshed.error);
        }
        logInfo(params, "standard", "Saved session expired, starting a new sign-in.");
        logWarning(params, "verbose", formatAuthError(refreshed.error));
        return await runDeviceFlow(params, storage, config);
      }
      await persistTokens(params, storage, refreshed.value);
      await ensureUserIdCached(params, {
        client: createIapiClient({ token: refreshed.value.accessToken }),
      });
      await logVerboseAuthInfo(params, config, refreshed.value);
      return ok({
        isAlreadyAuthenticated: false,
        identifier: identifierFromTokens(refreshed.value),
      });
    })
    .with({ type: "login" }, async () => runDeviceFlow(params, storage, config))
    .exhaustive();
};

const runDeviceFlow = async (
  params: LoginParams,
  storage: TokenStorage,
  config: Auth0Config,
): Promise<Result<LoginOutcome, AuthError>> => {
  const result = await loginViaDeviceFlow(config, deviceFlowDeps(params));
  if (isErr(result)) {
    return err(result.error);
  }
  await persistTokens(params, storage, result.value);
  // Fresh login may be a different account, so overwrite the cached userId.
  await ensureUserIdCached(params, {
    client: createIapiClient({ token: result.value.accessToken }),
    shouldForceRefresh: true,
  });
  await logVerboseAuthInfo(params, config, result.value);
  return ok({
    isAlreadyAuthenticated: false,
    identifier: identifierFromTokens(result.value),
  });
};

const persistTokens = async (
  params: LogOptions,
  storage: TokenStorage,
  tokens: TokenSet,
): Promise<void> => {
  const written = await storage.write(tokens);
  if (isErr(written)) {
    logWarning(params, "standard", formatAuthError(written.error));
  }
};

const identifierFromTokens = (tokens: TokenSet | null): string | null => tokens?.identifier ?? null;

const deviceFlowDeps = (params: LogOptions): DeviceFlowDeps => ({
  onUserCode: async ({ userCode, expiresInSeconds, verificationUriComplete }, done) => {
    logInfo(
      params,
      "standard",
      `To sign in, open:\n  ${verificationUriComplete}\n` +
        `Code: ${userCode} (expires in ${formatExpiry(expiresInSeconds)}).\n` +
        "Press Enter to open the browser.",
    );

    if (!process.stdin.isTTY) {
      await tryOpen(params, verificationUriComplete);
      return;
    }

    try {
      // Re-open the browser on each Enter; once() rejects when `done` aborts (polling settled).
      while (!done.aborted) {
        await once(process.stdin, "data", { signal: done });
        await tryOpen(params, verificationUriComplete);
      }
    } catch {
      // `done` aborted (auth done, denied, or expired) — stop re-opening.
    } finally {
      process.stdin.pause();
    }
  },
  nowMs: () => Date.now(),
});

const formatExpiry = (seconds: number): string =>
  seconds % 60 === 0 ? `${seconds / 60} minutes` : `${seconds} seconds`;

const tryOpen = async (params: LogOptions, url: string): Promise<void> => {
  try {
    await open(url);
  } catch (cause) {
    logWarning(
      params,
      "verbose",
      `Could not open the browser automatically: ${errorMessage(cause)}`,
    );
  }
};
