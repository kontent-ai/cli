import { match, P } from "ts-pattern";
import { type SelectEnvironmentError, selectEnvironment } from "../../core/environment/use.js";
import { formatAuthError } from "../../lib/auth/formatAuthError.js";
import { getValidAccessToken } from "../../lib/auth/tokenAccess.js";
import { createMapiClient } from "../../lib/mapi/client.js";
import { none, some } from "../../lib/option.js";
import { isErr } from "../../lib/result.js";
import { createLoggerFromArgs, type LogOptions } from "../../log.js";

export const runUse = async (args: LogOptions & Readonly<{ envId: string }>): Promise<void> => {
  const logger = createLoggerFromArgs(args);
  const envId = args.envId.trim();

  const token = await getValidAccessToken();
  if (isErr(token) && token.error.kind !== "not-logged-in") {
    logger.error(formatAuthError(token.error));
    process.exitCode = 1;
    return;
  }

  const mapiClient = isErr(token) ? none : some(createMapiClient({ token: token.value, envId }));
  const result = await selectEnvironment(envId, { mapiClient });
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

const formatSelectError = (error: SelectEnvironmentError, envId: string): string =>
  match(error)
    .with({ kind: "invalid-env-id" }, (e) => e.message)
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
