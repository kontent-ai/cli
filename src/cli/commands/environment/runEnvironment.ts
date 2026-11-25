import { match, P } from "ts-pattern";
import { isSessionRejected } from "../../../core/auth/session.js";
import type { AuthError } from "../../../core/auth/types.js";
import { mapiBaseUrl } from "../../../core/kontentUrl/kontentUrl.js";
import { isGuid } from "../../../core/lib/guid.js";
import { fromNullable, isNone, type Option } from "../../../core/lib/option.js";
import { err, isErr, map, mapErr, ok, type Result } from "../../../core/lib/result.js";
import { type Session, session } from "../../adapters/auth/tokenAccess.js";
import {
  type CliConfigStore,
  type ConfigReadError,
  cliConfigStore,
} from "../../adapters/config/cliConfig.js";
import { createEnvironments, type Environments } from "../../adapters/mapi/environments.js";
import type { Logger } from "../../log.js";
import type { CommandDeps } from "../../types/yargs.js";
import type { CommandOutcome } from "../shared/commandOutcome.js";
import { noEnvironmentAccessMessage } from "../shared/environmentAccess.js";
import { formatAuthError } from "../shared/formatAuthError.js";
import { sessionExpiredMessage } from "../shared/sessionExpired.js";
import { invalidEnvIdMessage } from "./invalidEnvIdMessage.js";

type SelectedEnvironment =
  | Readonly<{ kind: "verified"; envId: string; projectName: string; environmentName: string }>
  | Readonly<{ kind: "unverified"; envId: string; reason: AuthError }>;

type SelectEnvironmentError =
  | Readonly<{ kind: "invalid-env-id"; message: string }>
  | Readonly<{ kind: "environment-info-failed"; status: number | undefined; message: string }>
  | Readonly<{ kind: "config-write-failed"; message: string }>;

export type UseEffects = Readonly<{
  session: Session;
  environments: Environments;
  config: Pick<CliConfigStore, "write">;
}>;

/**
 * Stores the default environment. When logged in, verifies the id through the Management
 * API first, so a typo or a foreign id fails here rather than on a later request. Without a
 * usable session the id is stored unchecked: auth never blocks setting a local default.
 */
export const selectEnvironment = async (
  effects: UseEffects,
  envId: string,
): Promise<Result<SelectedEnvironment, SelectEnvironmentError>> => {
  const trimmed = envId.trim();
  if (!isGuid(trimmed)) {
    return err({ kind: "invalid-env-id", message: invalidEnvIdMessage(envId) });
  }

  const tokens = await effects.session.tokens();
  if (isErr(tokens)) {
    const written = await storeEnvId(effects, trimmed);
    if (isErr(written)) {
      return written;
    }
    return ok({ kind: "unverified", envId: trimmed, reason: tokens.error });
  }

  const info = await effects.environments.describe(trimmed, tokens.value.accessToken);
  if (isErr(info)) {
    return err({ kind: "environment-info-failed", ...info.error });
  }
  const written = await storeEnvId(effects, trimmed);
  if (isErr(written)) {
    return written;
  }
  return ok({ kind: "verified", envId: trimmed, ...info.value });
};

export const runUse = async (
  args: Readonly<{ envId: string }>,
  deps: CommandDeps,
  logger: Logger,
): Promise<CommandOutcome> => {
  const envId = args.envId.trim();

  const result = await selectEnvironment(
    {
      session,
      environments: createEnvironments(mapiBaseUrl(deps.kontentTarget)),
      config: cliConfigStore,
    },
    envId,
  );
  if (isErr(result)) {
    const failure = formatUseFailure(result.error, envId);
    logger.error(failure.message);
    return failure.outcome;
  }

  logger.info(
    "standard",
    match(result.value)
      .with(
        { kind: "verified" },
        (e) =>
          `Environment ${e.envId} ("${e.projectName}" / "${e.environmentName}") is now the default.`,
      )
      .with(
        { kind: "unverified" },
        (e) =>
          `Environment ${e.envId} is now the default (not verified: ${formatUnverifiedReason(e.reason)}).`,
      )
      .exhaustive(),
  );
  return { status: "success" };
};

export const formatUseFailure = (
  error: SelectEnvironmentError,
  envId: string,
): Readonly<{ message: string; outcome: CommandOutcome }> => {
  const isLoginRequired =
    error.kind === "environment-info-failed" &&
    isSessionRejected({ status: error.status, isLoginToken: true });
  return {
    message: isLoginRequired ? sessionExpiredMessage : formatSelectError(error, envId),
    outcome: {
      status: "error",
      reason: isLoginRequired ? "auth-required" : "failure",
      errorCode: error.kind,
    },
  };
};

export const runCurrent = async (logger: Logger): Promise<CommandOutcome> => {
  const current = await currentEnvironment({ config: cliConfigStore });
  if (isErr(current)) {
    logger.error(current.error.message);
    return { status: "error", reason: "failure", errorCode: "config-unreadable" };
  }
  const envId = current.value;
  if (isNone(envId)) {
    logger.error("No default environment is set. Run `kontent environment use <envId>`.");
    return { status: "error", reason: "failure", errorCode: "no-default-environment" };
  }
  process.stdout.write(`${envId.value}\n`);
  return { status: "success" };
};

export const runClear = async (logger: Logger): Promise<CommandOutcome> => {
  const result = await clearEnvironment({ config: cliConfigStore });
  if (isErr(result)) {
    logger.error(`Failed to update the config: ${result.error}`);
    return { status: "error", reason: "failure", errorCode: "config-write-failed" };
  }

  logger.info(
    "standard",
    result.value === "cleared" ? "Default environment cleared." : "No default environment was set.",
  );
  return { status: "success" };
};

const storeEnvId = async (
  effects: UseEffects,
  envId: string,
): Promise<Result<void, SelectEnvironmentError>> =>
  mapErr(await effects.config.write({ envId }), (message) => ({
    kind: "config-write-failed",
    message,
  }));

const formatSelectError = (error: SelectEnvironmentError, envId: string): string =>
  match(error)
    .with({ kind: "invalid-env-id" }, (e) => e.message)
    .with({ kind: "environment-info-failed", status: P.union(403, 404) }, () =>
      noEnvironmentAccessMessage(envId),
    )
    .with(
      { kind: "environment-info-failed" },
      (e) => `Failed to verify environment "${envId}":\n${e.message}`,
    )
    .with({ kind: "config-write-failed" }, (e) => `Failed to update the config: ${e.message}`)
    .exhaustive();

const formatUnverifiedReason = (reason: AuthError): string =>
  match(reason)
    .with({ kind: "not-logged-in" }, () => "not logged in")
    .with({ kind: "session-expired" }, () => "session expired")
    .otherwise(formatAuthError);

type CurrentEffects = Readonly<{ config: Pick<CliConfigStore, "read"> }>;

const currentEnvironment = async (
  effects: CurrentEffects,
): Promise<Result<Option<string>, ConfigReadError>> =>
  map(await effects.config.read(), (config) => fromNullable(config.envId));

type ClearEffects = Readonly<{ config: Pick<CliConfigStore, "read" | "write"> }>;

type ClearOutcome = "cleared" | "was-not-set";

const clearEnvironment = async (effects: ClearEffects): Promise<Result<ClearOutcome, string>> => {
  const config = await effects.config.read();
  if (isErr(config)) {
    return err(config.error.message);
  }
  if (config.value.envId === undefined) {
    return ok("was-not-set");
  }
  const written = await effects.config.write({ envId: undefined });
  if (isErr(written)) {
    return written;
  }
  return ok("cleared");
};
