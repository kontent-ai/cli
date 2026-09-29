import { readCliConfig } from "../../lib/config/cliConfig.js";
import { none, type Option, some } from "../../lib/option.js";
import type { Logger } from "../../log.js";

export type ResolvedEnvId = Readonly<{ envId: string; source: "flag" | "stored" }>;

// A stored id is announced because nothing on the command line shows which environment
// a request, possibly a DELETE, is about to hit.
export const resolveEnvId = async (
  flag: string | undefined,
  deps: Readonly<{ logger: Logger }>,
): Promise<Option<ResolvedEnvId>> => {
  if (flag !== undefined) {
    return some({ envId: flag, source: "flag" });
  }
  const { envId } = await readCliConfig();
  if (envId === undefined) {
    return none;
  }
  deps.logger.info("standard", `Using the stored default environment ${envId}.`);
  return some({ envId, source: "stored" });
};
