import { match, P } from "ts-pattern";
import { none, type Option, some } from "../lib/option.js";

export type ResolvedEnvId = Readonly<{ envId: string; source: "flag" | "stored" }>;

export const decideEnvId = (
  inputs: Readonly<{ envIdFromFlag: string | undefined; storedEnvId: string | undefined }>,
): Option<ResolvedEnvId> =>
  match([inputs.envIdFromFlag, inputs.storedEnvId] as const)
    .with([P.string, P._], ([envId]): Option<ResolvedEnvId> => some({ envId, source: "flag" }))
    .with(
      [undefined, P.string],
      ([, envId]): Option<ResolvedEnvId> => some({ envId, source: "stored" }),
    )
    .with([undefined, undefined], (): Option<ResolvedEnvId> => none)
    .exhaustive();
