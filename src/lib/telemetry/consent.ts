import { match } from "ts-pattern";

import type { CliConfig } from "../config/cliConfig.js";
import { isTruthyEnv } from "../env.js";

export type TelemetryOffReason =
  | "do-not-track-env"
  | "kontent-do-not-track-env"
  | "config-disabled"
  | "ci"
  | "missing-api-key";

export type TelemetryConsent =
  | { readonly isEnabled: true }
  | { readonly isEnabled: false; readonly reason: TelemetryOffReason };

export const isTelemetryDebug = (env: NodeJS.ProcessEnv): boolean =>
  isTruthyEnv(env.KONTENT_TELEMETRY_DEBUG);

export const resolveTelemetryConsent = (
  env: NodeJS.ProcessEnv,
  config: CliConfig,
  amplitudeApiKey: string,
  isCiRun: boolean,
): TelemetryConsent => {
  if (isTruthyEnv(env.DO_NOT_TRACK)) {
    return { isEnabled: false, reason: "do-not-track-env" };
  }
  if (isTruthyEnv(env.KONTENT_DO_NOT_TRACK)) {
    return { isEnabled: false, reason: "kontent-do-not-track-env" };
  }
  if (config.telemetryEnabled === false) {
    return { isEnabled: false, reason: "config-disabled" };
  }
  if (isCiRun) {
    return { isEnabled: false, reason: "ci" };
  }
  if (amplitudeApiKey === "") {
    return { isEnabled: false, reason: "missing-api-key" };
  }
  return { isEnabled: true };
};

export const formatTelemetryOffReason = (reason: TelemetryOffReason): string =>
  match(reason)
    .with("do-not-track-env", () => "DO_NOT_TRACK environment variable is set")
    .with("kontent-do-not-track-env", () => "KONTENT_DO_NOT_TRACK environment variable is set")
    .with("config-disabled", () => "disabled in the config file")
    .with("ci", () => "CI environment detected")
    .with("missing-api-key", () => "this build has no telemetry API key")
    .exhaustive();
