import open from "open";
import { match } from "ts-pattern";
import { getAuth0Config } from "../../lib/auth/config.js";
import { type DeviceFlowDeps, loginViaDeviceFlow } from "../../lib/auth/deviceFlow.js";
import { formatAuthError } from "../../lib/auth/formatAuthError.js";
import { logVerboseAuthInfo } from "../../lib/auth/logVerboseAuthInfo.js";
import { createKeyringStorage, type TokenStorage } from "../../lib/auth/storage.js";
import { decideAuth, refreshOrClear } from "../../lib/auth/tokenAccess.js";
import type { AuthError, TokenSet } from "../../lib/auth/types.js";
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
        return err(refreshed.error);
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
    .with({ type: "login" }, async () => {
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
    })
    .exhaustive();
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
  onUserCode: async ({ userCode, expiresInSeconds, verificationUriComplete }) => {
    logInfo(
      params,
      "standard",
      `Press Enter to open the browser. Code: ${userCode} (expires in ${formatExpiry(expiresInSeconds)}).`,
    );
    await waitForEnter();
    await open(verificationUriComplete);
  },
  nowMs: () => Date.now(),
});

const formatExpiry = (seconds: number): string =>
  seconds % 60 === 0 ? `${seconds / 60} minutes` : `${seconds} seconds`;

const waitForEnter = async (): Promise<void> => {
  await new Promise<void>((resolve) => {
    const onData = () => {
      process.stdin.removeListener("data", onData);
      process.stdin.pause();
      resolve();
    };
    process.stdin.resume();
    process.stdin.once("data", onData);
  });
};
