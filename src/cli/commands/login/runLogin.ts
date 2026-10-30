import { once } from "node:events";
import open from "open";
import { match } from "ts-pattern";
import type { AuthError } from "../../../core/auth/types.js";
import { iapiBaseUrl, type KontentTarget } from "../../../core/kontentUrl/kontentUrl.js";
import { errorMessage } from "../../../core/lib/error.js";
import { err, isErr, isOk, ok, type Result } from "../../../core/lib/result.js";
import {
  createDeviceSignIn,
  type DeviceFlowPrompt,
  type DeviceSignIn,
} from "../../adapters/auth/auth0.js";
import { getAuth0Config } from "../../adapters/auth/config.js";
import { createKeyringStorage, type TokenStorage } from "../../adapters/auth/storage.js";
import { type Session, session } from "../../adapters/auth/tokenAccess.js";
import { createUserIdCache, type UserIdCache } from "../../adapters/auth/userId.js";
import { systemClock } from "../../adapters/clock/clock.js";
import { createLoggerFromArgs, type Logger, type LogOptions } from "../../log.js";
import type { CommandDeps } from "../../types/yargs.js";
import { formatAuthError } from "../shared/formatAuthError.js";

export type LoginOutcome = Readonly<{
  isAlreadyAuthenticated: boolean;
  identifier: string | null;
}>;

export type LoginEffects = Readonly<{
  logger: Logger;
  session: Session;
  tokens: Pick<TokenStorage, "write">;
  deviceSignIn: DeviceSignIn;
  userIds: UserIdCache;
}>;

export const login = async (effects: LoginEffects): Promise<Result<LoginOutcome, AuthError>> => {
  const current = await effects.session.tokens();
  if (isOk(current)) {
    await effects.userIds.ensure(current.value.accessToken, { shouldForceRefresh: false });
    return ok({ isAlreadyAuthenticated: true, identifier: current.value.identifier ?? null });
  }

  return match(current.error)
    .with({ kind: "not-logged-in" }, async () => signInWithDeviceFlow(effects))
    .with({ kind: "session-expired" }, async ({ refreshError }) => {
      effects.logger.info("standard", "Saved session expired, starting a new sign-in.");
      effects.logger.warning("verbose", formatAuthError(refreshError));
      return await signInWithDeviceFlow(effects);
    })
    .otherwise(async (error) => err(error));
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

const signInWithDeviceFlow = async (
  effects: LoginEffects,
): Promise<Result<LoginOutcome, AuthError>> => {
  const signedIn = await effects.deviceSignIn.signIn();
  if (isErr(signedIn)) {
    return signedIn;
  }
  const written = await effects.tokens.write(signedIn.value);
  if (isErr(written)) {
    return written;
  }
  // Fresh login may be a different account, so overwrite the cached userId.
  await effects.userIds.ensure(signedIn.value.accessToken, { shouldForceRefresh: true });
  return ok({ isAlreadyAuthenticated: false, identifier: signedIn.value.identifier ?? null });
};

const formatLoginOutcome = (outcome: LoginOutcome): string => {
  const base = outcome.isAlreadyAuthenticated ? "Already authenticated" : "Logged in";
  return outcome.identifier === null ? base : `${base} as ${outcome.identifier}`;
};

const createLoginEffects = (logger: Logger, kontentTarget: KontentTarget): LoginEffects => ({
  logger,
  session,
  tokens: createKeyringStorage(),
  deviceSignIn: createDeviceSignIn(getAuth0Config(), deviceFlowPrompt(logger), systemClock),
  userIds: createUserIdCache(logger, iapiBaseUrl(kontentTarget)),
});

const deviceFlowPrompt = (logger: Logger): DeviceFlowPrompt => ({
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
