import { writeCliConfig } from "../../lib/config/cliConfig.js";
import { isGuid } from "../../lib/guid.js";
import type { MapiClient } from "../../lib/mapi/client.js";
import { mapiErrorMessage, mapiErrorStatus } from "../../lib/mapi/error.js";
import { isNone, type Option } from "../../lib/option.js";
import { err, isErr, mapErr, ok, type Result, tryAsync } from "../../lib/result.js";
import { invalidEnvIdMessage } from "./envId.js";

export type SelectedEnvironment =
  | Readonly<{ kind: "verified"; envId: string; projectName: string; environmentName: string }>
  | Readonly<{ kind: "unverified"; envId: string }>;

export type SelectEnvironmentError =
  | Readonly<{ kind: "invalid-env-id"; message: string }>
  | Readonly<{ kind: "environment-info-failed"; status: number | undefined; message: string }>
  | Readonly<{ kind: "config-write-failed"; message: string }>;

/**
 * Stores the default environment. Given a Management API client, verifies the id through it
 * first, so a typo or a foreign id fails here rather than on a later request. Without a login
 * there is no client and the id is stored unchecked.
 */
export const selectEnvironment = async (
  envId: string,
  deps: Readonly<{ mapiClient: Option<MapiClient> }>,
): Promise<Result<SelectedEnvironment, SelectEnvironmentError>> => {
  const trimmed = envId.trim();
  if (!isGuid(trimmed)) {
    return err({ kind: "invalid-env-id", message: invalidEnvIdMessage(envId) });
  }

  if (isNone(deps.mapiClient)) {
    const written = await storeEnvId(trimmed);
    if (isErr(written)) {
      return written;
    }
    return ok({ kind: "unverified", envId: trimmed });
  }

  const client = deps.mapiClient.value;
  const info = await tryAsync(
    async () => (await client.environmentInformation().toPromise()).data.project,
    (cause): SelectEnvironmentError => ({
      kind: "environment-info-failed",
      status: mapiErrorStatus(cause),
      message: mapiErrorMessage(cause),
    }),
  );
  if (isErr(info)) {
    return info;
  }

  const written = await storeEnvId(trimmed);
  if (isErr(written)) {
    return written;
  }

  return ok({
    kind: "verified",
    envId: trimmed,
    projectName: info.value.name,
    environmentName: info.value.environment,
  });
};

const storeEnvId = async (envId: string): Promise<Result<void, SelectEnvironmentError>> =>
  mapErr(await writeCliConfig({ envId }), (message) => ({ kind: "config-write-failed", message }));
