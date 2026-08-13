import { isCI } from "ci-info";
import { getCliConfigPath, readCliConfig, writeCliConfig } from "../../lib/config/cliConfig.js";
import { isTruthyEnv } from "../../lib/env.js";
import { isErr } from "../../lib/result.js";
import { formatTelemetryOffReason, resolveTelemetryConsent } from "../../lib/telemetry/consent.js";
import { amplitudeApiKey } from "../../lib/telemetry/context.js";
import type { Logger } from "../../log.js";

export const showTelemetryStatus = async (logger: Logger): Promise<void> => {
  const config = await readCliConfig();
  const consent = resolveTelemetryConsent(process.env, config, amplitudeApiKey, isCI);

  const reasonLine = consent.isEnabled
    ? config.telemetryEnabled === true
      ? "Reason: enabled in the config file"
      : "Reason: default (no opt-out detected)"
    : `Reason: ${formatTelemetryOffReason(consent.reason)}`;

  logger.info(
    "standard",
    [
      `Telemetry: ${consent.isEnabled ? "enabled" : "disabled"}`,
      reasonLine,
      `Config file: ${getCliConfigPath()}`,
    ].join("\n"),
  );
};

export const setTelemetryStatus = async (logger: Logger, isEnabled: boolean): Promise<void> => {
  const written = await writeCliConfig({
    telemetryEnabled: isEnabled,
    telemetryNoticeShown: true,
  });
  if (isErr(written)) {
    logger.error(`Failed to update telemetry config: ${written.error}`);
    process.exitCode = 1;
    return;
  }
  logger.info("standard", isEnabled ? "Telemetry enabled." : "Telemetry disabled.");
  if (isEnabled) {
    warnIfEnvForcesOff(logger);
  }
};

const warnIfEnvForcesOff = (logger: Logger): void => {
  if (isTruthyEnv(process.env.DO_NOT_TRACK)) {
    logger.warning("standard", "DO_NOT_TRACK is set, so telemetry stays off in this environment.");
  }
  if (isTruthyEnv(process.env.KONTENT_DO_NOT_TRACK)) {
    logger.warning(
      "standard",
      "KONTENT_DO_NOT_TRACK is set, so telemetry stays off in this environment.",
    );
  }
};
