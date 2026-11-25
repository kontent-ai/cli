import { decideEnvId, type ResolvedEnvId } from "../../../core/environment/envId.js";
import { isNone } from "../../../core/lib/option.js";
import { err, isErr, ok, type Result } from "../../../core/lib/result.js";
import type { CliConfig, CliConfigStore } from "../../adapters/config/cliConfig.js";
import type { Logger } from "../../log.js";

export type EnvIdError =
  | Readonly<{ kind: "missing-env-id" }>
  | Readonly<{ kind: "config-unreadable"; message: string }>;

type ResolveEnvIdEffects = Readonly<{
  config: Pick<CliConfigStore, "read">;
  logger: Logger;
}>;

/**
 * `--envId`, else the default from `kontent environment use`. The config is read only without
 * the flag, so a broken config never blocks a request that names its environment.
 */
export const resolveEnvId = async (
  effects: ResolveEnvIdEffects,
  envIdFromFlag: string | undefined,
): Promise<Result<ResolvedEnvId, EnvIdError>> => {
  const config = envIdFromFlag === undefined ? await effects.config.read() : ok<CliConfig>({});
  if (isErr(config)) {
    return err({ kind: "config-unreadable", message: config.error.message });
  }
  const env = decideEnvId({ envIdFromFlag, storedEnvId: config.value.envId });
  if (isNone(env)) {
    return err({ kind: "missing-env-id" });
  }
  // Announced because nothing on the command line shows which environment a request, possibly
  // a DELETE, is about to hit.
  if (env.value.source === "stored") {
    effects.logger.info("standard", `Using the stored default environment ${env.value.envId}.`);
  }
  return ok(env.value);
};
