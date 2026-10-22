import { isCI } from "ci-info";
import { isErr, type Result } from "../../../core/lib/result.js";
import {
  activeEnvOptOuts,
  decideTelemetryConsent,
  type TelemetryConsent,
} from "../../../core/telemetry/consent.js";
import { type CliConfigStore, cliConfigStore } from "../../adapters/config/cliConfig.js";
import { formatTelemetryOffReason } from "../../adapters/telemetry/consent.js";
import { amplitudeApiKey } from "../../adapters/telemetry/context.js";
import { createLoggerFromArgs, type LogOptions } from "../../log.js";

/**
 * Writes the report to stdout rather than logging it: it is the payload the
 * command exists to produce, so it belongs on stdout, ungated by --logLevel.
 */
export const runStatus = async (): Promise<void> => {
  const status = await telemetryStatus(
    { config: cliConfigStore },
    { env: process.env, isCiRun: isCI, amplitudeApiKey },
  );
  process.stdout.write(`${formatStatusReport(status)}\n`);
};

export const runSetTelemetry = async (args: LogOptions, isEnabled: boolean): Promise<void> => {
  const logger = createLoggerFromArgs(args);

  const written = await setTelemetry({ config: cliConfigStore }, isEnabled);
  if (isErr(written)) {
    logger.error(`Failed to update telemetry config: ${written.error}`);
    process.exitCode = 1;
    return;
  }
  logger.info("standard", isEnabled ? "Telemetry enabled." : "Telemetry disabled.");
  if (isEnabled) {
    for (const name of activeEnvOptOuts(process.env)) {
      logger.warning("standard", `${name} is set, so telemetry stays off in this environment.`);
    }
  }
};

type TelemetryRuntime = Readonly<{
  env: NodeJS.ProcessEnv;
  isCiRun: boolean;
  amplitudeApiKey: string;
}>;

type StatusEffects = Readonly<{ config: Pick<CliConfigStore, "path" | "read"> }>;

type TelemetryStatus = Readonly<{
  consent: TelemetryConsent;
  isEnabledInConfig: boolean;
  configPath: string;
}>;

const telemetryStatus = async (
  effects: StatusEffects,
  runtime: TelemetryRuntime,
): Promise<TelemetryStatus> => {
  const config = await effects.config.read();
  return {
    consent: decideTelemetryConsent({ ...runtime, telemetryEnabled: config.telemetryEnabled }),
    isEnabledInConfig: config.telemetryEnabled === true,
    configPath: effects.config.path(),
  };
};

const formatStatusReport = (status: TelemetryStatus): string => {
  const reasonLine = status.consent.isEnabled
    ? status.isEnabledInConfig
      ? "Reason: enabled in the config file"
      : "Reason: default (no opt-out detected)"
    : `Reason: ${formatTelemetryOffReason(status.consent.reason)}`;

  return [
    `Telemetry: ${status.consent.isEnabled ? "enabled" : "disabled"}`,
    reasonLine,
    `Config file: ${status.configPath}`,
  ].join("\n");
};

type SetEffects = Readonly<{ config: Pick<CliConfigStore, "write"> }>;

const setTelemetry = async (
  effects: SetEffects,
  isEnabled: boolean,
): Promise<Result<void, string>> =>
  effects.config.write({ telemetryEnabled: isEnabled, telemetryNoticeShown: true });
