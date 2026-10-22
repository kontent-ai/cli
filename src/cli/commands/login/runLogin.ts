import { once } from "node:events";
import open from "open";
import { match } from "ts-pattern";
import { decideAfterRefreshFailure, decideAuth } from "../../../core/auth/decideAuth.js";
import type { AuthError, TokenSet } from "../../../core/auth/types.js";
import { iapiBaseUrl, type KontentTarget } from "../../../core/kontentUrl/kontentUrl.js";
import { errorMessage } from "../../../core/lib/error.js";
import { err, isErr, isOk, ok, type Result } from "../../../core/lib/result.js";
import { type Auth0, createAuth0, type DeviceFlowDeps } from "../../adapters/auth/auth0.js";
import { getAuth0Config } from "../../adapters/auth/config.js";
import { createKeyringStorage, type TokenStorage } from "../../adapters/auth/storage.js";
import { createUserIdCache, type UserIdCache } from "../../adapters/auth/userId.js";
import { createLoggerFromArgs, type Logger, type LogOptions } from "../../log.js";
import type { CommandDeps } from "../../types/yargs.js";
import { formatAuthError } from "../shared/formatAuthError.js";

export type LoginOutcome = Readonly<{
  isAlreadyAuthenticated: boolean;
  identifier: string | null;
}>;

export type LoginEffects = Readonly<{
  logger: Logger;
  clock: Readonly<{ now: () => number }>;
  tokens: Pick<TokenStorage, "read" | "write" | "clear">;
  auth: Auth0;
  userIds: UserIdCache;
}>;

export const login = async (effects: LoginEffects): Promise<Result<LoginOutcome, AuthError>> => {
  const stored = await effects.tokens.read();
  if (isErr(stored)) {
    effects.logger.warning("standard", formatAuthError(stored.error));
  }
  const storedTokens = isOk(stored) ? stored.value : null;

  return match(decideAuth(storedTokens, effects.clock.now()))
    .with({ type: "use-existing-token" }, async ({ accessToken }) => {
      await effects.userIds.ensure(accessToken, { shouldForceRefresh: false });
      return ok({ isAlreadyAuthenticated: true, identifier: identifierFromTokens(storedTokens) });
    })
    .with({ type: "refresh-token" }, async ({ refreshToken }) => {
      const refreshed = await effects.auth.refresh(refreshToken);
      if (isErr(refreshed)) {
        if (decideAfterRefreshFailure(refreshed.error) === "keep-session") {
          return err(refreshed.error);
        }
        await effects.tokens.clear();
        effects.logger.info("standard", "Saved session expired, starting a new sign-in.");
        effects.logger.warning("verbose", formatAuthError(refreshed.error));
        return await signInWithDeviceFlow(effects);
      }
      await persistTokens(effects, refreshed.value);
      await effects.userIds.ensure(refreshed.value.accessToken, { shouldForceRefresh: false });
      return ok({
        isAlreadyAuthenticated: false,
        identifier: identifierFromTokens(refreshed.value),
      });
    })
    .with({ type: "login" }, async () => signInWithDeviceFlow(effects))
    .exhaustive();
};

export const runLogin = async (args: LogOptions, deps: CommandDeps): Promise<void> => {
  const logger = createLoggerFromArgs(args);
  const tracker = deps.telemetry.startCommandTracking("login", logger);

  const result = await login(createLoginEffects(logger, deps.kontentTarget));
  if (isErr(result)) {
    tracker.fail(result.error.kind);
    logger.error(formatAuthError(result.error));
    process.exitCode = 1;
    return;
  }
  tracker.succeed();
  logger.info("standard", formatLoginOutcome(result.value));
};

const identifierFromTokens = (tokens: TokenSet | null): string | null => tokens?.identifier ?? null;

const persistTokens = async (effects: LoginEffects, tokens: TokenSet): Promise<void> => {
  const written = await effects.tokens.write(tokens);
  if (isErr(written)) {
    effects.logger.warning("standard", formatAuthError(written.error));
  }
};

const signInWithDeviceFlow = async (
  effects: LoginEffects,
): Promise<Result<LoginOutcome, AuthError>> => {
  const result = await effects.auth.signInWithDeviceFlow();
  if (isErr(result)) {
    return err(result.error);
  }
  await persistTokens(effects, result.value);
  // Fresh login may be a different account, so overwrite the cached userId.
  await effects.userIds.ensure(result.value.accessToken, { shouldForceRefresh: true });
  return ok({
    isAlreadyAuthenticated: false,
    identifier: identifierFromTokens(result.value),
  });
};

const formatLoginOutcome = (outcome: LoginOutcome): string => {
  const base = outcome.isAlreadyAuthenticated ? "Already authenticated" : "Logged in";
  return outcome.identifier === null ? base : `${base} as ${outcome.identifier}`;
};

const createLoginEffects = (logger: Logger, kontentTarget: KontentTarget): LoginEffects => ({
  logger,
  clock: { now: Date.now },
  tokens: createKeyringStorage(),
  auth: createAuth0(getAuth0Config(), deviceFlowPrompt(logger)),
  userIds: createUserIdCache(logger, iapiBaseUrl(kontentTarget)),
});

const deviceFlowPrompt = (logger: Logger): DeviceFlowDeps => ({
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
