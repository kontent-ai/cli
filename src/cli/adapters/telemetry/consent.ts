import { match } from "ts-pattern";
import { isTruthyEnv } from "../../../core/lib/env.js";
import type { OptOutVariables, TelemetryOffReason } from "../../../core/telemetry/consent.js";

export const readOptOutVariables = (env: NodeJS.ProcessEnv): OptOutVariables => ({
  doNotTrack: env.DO_NOT_TRACK,
  kontentDoNotTrack: env.KONTENT_DO_NOT_TRACK,
});

export const isTelemetryDebug = (env: NodeJS.ProcessEnv): boolean =>
  isTruthyEnv(env.KONTENT_TELEMETRY_DEBUG);

export const formatTelemetryOffReason = (reason: TelemetryOffReason): string =>
  match(reason)
    .with("do-not-track-env", () => "DO_NOT_TRACK environment variable is set")
    .with("kontent-do-not-track-env", () => "KONTENT_DO_NOT_TRACK environment variable is set")
    .with("config-disabled", () => "disabled in the config file")
    .with("ci", () => "CI environment detected")
    .with("missing-api-key", () => "this build has no telemetry API key")
    .exhaustive();
