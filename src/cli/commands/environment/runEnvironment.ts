import { match, P } from "ts-pattern";
import type { AuthError } from "../../../core/auth/types.js";
import { decideVerification } from "../../../core/environment/decideVerification.js";
import { mapiBaseUrl } from "../../../core/kontentUrl/kontentUrl.js";
import { isGuid } from "../../../core/lib/guid.js";
import { fromNullable, isNone, type Option } from "../../../core/lib/option.js";
import { err, isErr, mapErr, ok, type Result } from "../../../core/lib/result.js";
import { type Session, session } from "../../adapters/auth/tokenAccess.js";
import { type CliConfigStore, cliConfigStore } from "../../adapters/config/cliConfig.js";
import { createEnvironments, type Environments } from "../../adapters/mapi/environments.js";
import { createLoggerFromArgs, type LogOptions } from "../../log.js";
import type { CommandDeps } from "../../types/yargs.js";
import { formatAuthError } from "../shared/formatAuthError.js";
import { invalidEnvIdMessage } from "./invalidEnvIdMessage.js";

type SelectedEnvironment =
  | Readonly<{ kind: "verified"; envId: string; projectName: string; environmentName: string }>
  | Readonly<{ kind: "unverified"; envId: string }>;

type SelectEnvironmentError =
  | Readonly<{ kind: "invalid-env-id"; message: string }>
  | Readonly<{ kind: "auth-failed"; error: AuthError }>
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
 * login the id is stored unchecked.
 */
export const selectEnvironment = async (
  effects: UseEffects,
  envId: string,
): Promise<Result<SelectedEnvironment, SelectEnvironmentError>> => {
  const trimmed = envId.trim();
  if (!isGuid(trimmed)) {
    return err({ kind: "invalid-env-id", message: invalidEnvIdMessage(envId) });
  }

  return match(decideVerification(await effects.session.accessToken()))
    .with(
      { kind: "fail" },
      async ({ error }): Promise<Result<SelectedEnvironment, SelectEnvironmentError>> =>
        err({ kind: "auth-failed", error }),
    )
    .with(
      { kind: "skip-verification" },
      async (): Promise<Result<SelectedEnvironment, SelectEnvironmentError>> => {
        const written = await storeEnvId(effects, trimmed);
        if (isErr(written)) {
          return written;
        }
        return ok({ kind: "unverified", envId: trimmed });
      },
    )
    .with(
      { kind: "verify" },
      async ({ accessToken }): Promise<Result<SelectedEnvironment, SelectEnvironmentError>> => {
        const info = await effects.environments.describe(trimmed, accessToken);
        if (isErr(info)) {
          return err({ kind: "environment-info-failed", ...info.error });
        }
        const written = await storeEnvId(effects, trimmed);
        if (isErr(written)) {
          return written;
        }
        return ok({ kind: "verified", envId: trimmed, ...info.value });
      },
    )
    .exhaustive();
};

export const runUse = async (
  args: LogOptions & Readonly<{ envId: string }>,
  deps: CommandDeps,
): Promise<void> => {
  const logger = createLoggerFromArgs(args);
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
    logger.error(formatSelectError(result.error, envId));
    process.exitCode = 1;
    return;
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
        (e) => `Environment ${e.envId} is now the default (not verified: not logged in).`,
      )
      .exhaustive(),
  );
};

export const runCurrent = async (args: LogOptions): Promise<void> => {
  const envId = await currentEnvironment({ config: cliConfigStore });
  if (isNone(envId)) {
    createLoggerFromArgs(args).error(
      "No default environment is set. Run `kontent environment use <envId>`.",
    );
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`${envId.value}\n`);
};

export const runClear = async (args: LogOptions): Promise<void> => {
  const logger = createLoggerFromArgs(args);

  const result = await clearEnvironment({ config: cliConfigStore });
  if (isErr(result)) {
    logger.error(`Failed to update the config: ${result.error}`);
    process.exitCode = 1;
    return;
  }

  logger.info(
    "standard",
    result.value === "cleared" ? "Default environment cleared." : "No default environment was set.",
  );
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
    .with({ kind: "auth-failed" }, (e) => formatAuthError(e.error))
    .with(
      { kind: "environment-info-failed", status: 401 },
      () => "Your session is no longer valid. Run `kontent login` to sign in again.",
    )
    .with(
      { kind: "environment-info-failed", status: P.union(403, 404) },
      () =>
        `You don't have access to environment "${envId}", or it does not exist. Check you're signed in with the right account (run \`kontent login\` to switch).`,
    )
    .with(
      { kind: "environment-info-failed" },
      (e) => `Failed to verify environment "${envId}":\n${e.message}`,
    )
    .with({ kind: "config-write-failed" }, (e) => `Failed to update the config: ${e.message}`)
    .exhaustive();

type CurrentEffects = Readonly<{ config: Pick<CliConfigStore, "read"> }>;

const currentEnvironment = async (effects: CurrentEffects): Promise<Option<string>> =>
  fromNullable((await effects.config.read()).envId);

type ClearEffects = Readonly<{ config: Pick<CliConfigStore, "read" | "write"> }>;

type ClearOutcome = "cleared" | "was-not-set";

const clearEnvironment = async (effects: ClearEffects): Promise<Result<ClearOutcome, string>> => {
  const { envId } = await effects.config.read();
  if (envId === undefined) {
    return ok("was-not-set");
  }
  const written = await effects.config.write({ envId: undefined });
  if (isErr(written)) {
    return written;
  }
  return ok("cleared");
};
