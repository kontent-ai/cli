import { isTruthyEnv } from "../../../core/lib/env.js";
import type { OptOutVariables } from "../../../core/telemetry/consent.js";

export const readOptOutVariables = (env: NodeJS.ProcessEnv): OptOutVariables => ({
  doNotTrack: env.DO_NOT_TRACK,
  kontentDoNotTrack: env.KONTENT_DO_NOT_TRACK,
});

export const isTelemetryDebug = (env: NodeJS.ProcessEnv): boolean =>
  isTruthyEnv(env.KONTENT_TELEMETRY_DEBUG);
