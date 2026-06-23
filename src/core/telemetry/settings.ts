import { isCI } from "ci-info";
import { getCliConfigPath, readCliConfig, writeCliConfig } from "../../lib/config/cliConfig.js";
import { isTruthyEnv } from "../../lib/env.js";
import { isErr } from "../../lib/result.js";
import { formatTelemetryOffReason, resolveTelemetryConsent } from "../../lib/telemetry/consent.js";
import { amplitudeApiKey } from "../../lib/telemetry/context.js";
import { type LogOptions, logError, logInfo, logWarning } from "../../log.js";

export type TelemetryCommandParams = LogOptions;

export const showTelemetryStatus = async (params: TelemetryCommandParams): Promise<void> => {
  const config = await readCliConfig();
  const consent = resolveTelemetryConsent(process.env, config, amplitudeApiKey, isCI);

  const reasonLine = consent.isEnabled
    ? config.telemetryEnabled === true
      ? "Reason: enabled in the config file"
      : "Reason: default (no opt-out detected)"
    : `Reason: ${formatTelemetryOffReason(consent.reason)}`;

  logInfo(
    params,
    "standard",
    [
      `Telemetry: ${consent.isEnabled ? "enabled" : "disabled"}`,
      reasonLine,
      `Config file: ${getCliConfigPath()}`,
    ].join("\n"),
  );
};

export const setTelemetryStatus = async (
  params: TelemetryCommandParams,
  isEnabled: boolean,
): Promise<void> => {
  const written = await writeCliConfig({
    telemetryEnabled: isEnabled,
    telemetryNoticeShown: true,
  });
  if (isErr(written)) {
    logError(params, `Failed to update telemetry config: ${written.error}`);
    process.exitCode = 1;
    return;
  }
  logInfo(params, "standard", isEnabled ? "Telemetry enabled." : "Telemetry disabled.");
  if (isEnabled) {
    warnIfEnvForcesOff(params);
  }
};

const warnIfEnvForcesOff = (params: TelemetryCommandParams): void => {
  if (isTruthyEnv(process.env.DO_NOT_TRACK)) {
    logWarning(
      params,
      "standard",
      "Note: DO_NOT_TRACK is set, so telemetry stays off in this environment.",
    );
  }
  if (isTruthyEnv(process.env.KONTENT_DO_NOT_TRACK)) {
    logWarning(
      params,
      "standard",
      "Note: KONTENT_DO_NOT_TRACK is set, so telemetry stays off in this environment.",
    );
  }
};
