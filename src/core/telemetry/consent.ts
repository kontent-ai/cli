import { isTruthyEnv } from "../lib/env.js";

export type TelemetryOffReason =
  | "do-not-track-env"
  | "kontent-do-not-track-env"
  | "config-disabled"
  | "ci"
  | "missing-api-key";

export type TelemetryConsent =
  | { readonly isEnabled: true }
  | { readonly isEnabled: false; readonly reason: TelemetryOffReason };

/** The raw values of the DO_NOT_TRACK and KONTENT_DO_NOT_TRACK environment variables. */
export type OptOutVariables = Readonly<{
  doNotTrack: string | undefined;
  kontentDoNotTrack: string | undefined;
}>;

export type ConsentInputs = Readonly<{
  optOutVariables: OptOutVariables;
  telemetryEnabled: boolean | undefined;
  amplitudeApiKey: string;
  isCiRun: boolean;
}>;

export const decideTelemetryConsent = ({
  optOutVariables,
  telemetryEnabled,
  amplitudeApiKey,
  isCiRun,
}: ConsentInputs): TelemetryConsent => {
  if (isTruthyEnv(optOutVariables.doNotTrack)) {
    return { isEnabled: false, reason: "do-not-track-env" };
  }
  if (isTruthyEnv(optOutVariables.kontentDoNotTrack)) {
    return { isEnabled: false, reason: "kontent-do-not-track-env" };
  }
  if (telemetryEnabled === false) {
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

type EnvOptOut = "DO_NOT_TRACK" | "KONTENT_DO_NOT_TRACK";

// Opt-outs that keep telemetry off whatever the config says.
export const activeEnvOptOuts = (optOutVariables: OptOutVariables): ReadonlyArray<EnvOptOut> => [
  ...(isTruthyEnv(optOutVariables.doNotTrack) ? (["DO_NOT_TRACK"] as const) : []),
  ...(isTruthyEnv(optOutVariables.kontentDoNotTrack) ? (["KONTENT_DO_NOT_TRACK"] as const) : []),
];
