import { once } from "node:events";
import type { BaseUrl } from "@kontent-ai/core-sdk";
import open from "open";
import { match } from "ts-pattern";
import type { AuthError, TokenSet } from "../../../core/auth/types.js";
import { iapiBaseUrl, type KontentTarget } from "../../../core/kontentUrl/kontentUrl.js";
import { errorMessage } from "../../../core/lib/error.js";
import { err, isErr, isOk, ok, type Result } from "../../../core/lib/result.js";
import { type DeviceFlowDeps, loginViaDeviceFlow } from "../../adapters/auth/auth0.js";
import { type Auth0Config, getAuth0Config } from "../../adapters/auth/config.js";
import { createKeyringStorage, type TokenStorage } from "../../adapters/auth/storage.js";
import { decideAuth, refreshOrClear } from "../../adapters/auth/tokenAccess.js";
import { createIapiClient } from "../../adapters/iapi/client.js";
import type { Logger } from "../../log.js";
import { formatAuthError } from "../shared/formatAuthError.js";
import { ensureUserIdCached } from "../shared/user.js";

export type LoginOutcome = Readonly<{
  isAlreadyAuthenticated: boolean;
  identifier: string | null;
}>;

export const performLogin = async (
  logger: Logger,
  kontentTarget: KontentTarget,
): Promise<Result<LoginOutcome, AuthError>> => {
  const config = getAuth0Config();
  const storage = createKeyringStorage();
  const baseUrl = iapiBaseUrl(kontentTarget);

  const stored = await storage.read();
  if (isErr(stored)) {
    logger.warning("standard", formatAuthError(stored.error));
  }
  const storedTokens = isOk(stored) ? stored.value : null;

  const decision = decideAuth(storedTokens, Date.now());

  return match(decision)
    .with({ type: "use-existing-token" }, async () => {
      if (storedTokens !== null) {
        await ensureUserIdCached(logger, {
          client: createIapiClient({ token: storedTokens.accessToken, baseUrl }),
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
        logger.info("standard", "Saved session expired, starting a new sign-in.");
        logger.warning("verbose", formatAuthError(refreshed.error));
        return await runDeviceFlow(logger, storage, config, baseUrl);
      }
      await persistTokens(logger, storage, refreshed.value);
      await ensureUserIdCached(logger, {
        client: createIapiClient({ token: refreshed.value.accessToken, baseUrl }),
      });
      return ok({
        isAlreadyAuthenticated: false,
        identifier: identifierFromTokens(refreshed.value),
      });
    })
    .with({ type: "login" }, async () => runDeviceFlow(logger, storage, config, baseUrl))
    .exhaustive();
};

const runDeviceFlow = async (
  logger: Logger,
  storage: TokenStorage,
  config: Auth0Config,
  baseUrl: BaseUrl,
): Promise<Result<LoginOutcome, AuthError>> => {
  const result = await loginViaDeviceFlow(config, deviceFlowDeps(logger));
  if (isErr(result)) {
    return err(result.error);
  }
  await persistTokens(logger, storage, result.value);
  // Fresh login may be a different account, so overwrite the cached userId.
  await ensureUserIdCached(logger, {
    client: createIapiClient({ token: result.value.accessToken, baseUrl }),
    shouldForceRefresh: true,
  });
  return ok({
    isAlreadyAuthenticated: false,
    identifier: identifierFromTokens(result.value),
  });
};

const persistTokens = async (
  logger: Logger,
  storage: TokenStorage,
  tokens: TokenSet,
): Promise<void> => {
  const written = await storage.write(tokens);
  if (isErr(written)) {
    logger.warning("standard", formatAuthError(written.error));
  }
};

const identifierFromTokens = (tokens: TokenSet | null): string | null => tokens?.identifier ?? null;

const deviceFlowDeps = (logger: Logger): DeviceFlowDeps => ({
  onUserCode: async ({ userCode, expiresInSeconds, verificationUriComplete }, done) => {
    logger.info(
      "standard",
      `To sign in, open:\n  ${verificationUriComplete}\n` +
        `Code: ${userCode} (expires in ${formatExpiry(expiresInSeconds)}).\n` +
        "Press Enter to open the browser.",
    );

    if (!process.stdin.isTTY) {
      await tryOpen(logger, verificationUriComplete);
      return;
    }

    try {
      // Re-open the browser on each Enter; once() rejects when `done` aborts (polling settled).
      while (!done.aborted) {
        await once(process.stdin, "data", { signal: done });
        await tryOpen(logger, verificationUriComplete);
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

const tryOpen = async (logger: Logger, url: string): Promise<void> => {
  try {
    await open(url);
  } catch (cause) {
    logger.warning("standard", `Could not open the browser automatically: ${errorMessage(cause)}`);
  }
};
