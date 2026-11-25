import { isCI } from "ci-info";
import { match } from "ts-pattern";
import { isSome, none, type Option, some } from "../../../core/lib/option.js";
import { isErr, isOk, type Result } from "../../../core/lib/result.js";
import {
  activeEnvOptOuts,
  decideTelemetryConsent,
  type OptOutVariables,
  type TelemetryConsent,
  type TelemetryOffReason,
} from "../../../core/telemetry/consent.js";
import {
  type CliConfigStore,
  type ConfigReadError,
  cliConfigStore,
} from "../../adapters/config/cliConfig.js";
import { readOptOutVariables } from "../../adapters/telemetry/consent.js";
import { amplitudeApiKey } from "../../adapters/telemetry/context.js";
import type { Logger } from "../../log.js";
import { type CommandOutcome, createFailureOutcome } from "../shared/commandOutcome.js";

/**
 * Writes the report to stdout rather than logging it: it is the payload the
 * command exists to produce, so it belongs on stdout, ungated by --logLevel.
 */
export const runStatus = async (): Promise<CommandOutcome> => {
  const status = await telemetryStatus(
    { config: cliConfigStore },
    { optOutVariables: readOptOutVariables(process.env), isCiRun: isCI, amplitudeApiKey },
  );
  process.stdout.write(`${formatStatusReport(status)}\n`);
  return { status: "success" };
};

export const runSetTelemetry = async (
  logger: Logger,
  isEnabled: boolean,
): Promise<CommandOutcome> => {
  const written = await setTelemetry({ config: cliConfigStore }, isEnabled);
  if (isErr(written)) {
    logger.error(`Failed to update telemetry config: ${written.error}`);
    return createFailureOutcome("config-write-failed");
  }
  logger.info("standard", isEnabled ? "Telemetry enabled." : "Telemetry disabled.");
  if (isEnabled) {
    for (const name of activeEnvOptOuts(readOptOutVariables(process.env))) {
      logger.warning("standard", `${name} is set, so telemetry stays off in this environment.`);
    }
  }
  return { status: "success" };
};

type TelemetryRuntime = Readonly<{
  optOutVariables: OptOutVariables;
  isCiRun: boolean;
  amplitudeApiKey: string;
}>;

type StatusEffects = Readonly<{ config: Pick<CliConfigStore, "path" | "read"> }>;

type TelemetryStatus = Readonly<{
  consent: TelemetryConsent;
  isEnabledInConfig: boolean;
  configPath: string;
  configError: Option<ConfigReadError>;
}>;

const telemetryStatus = async (
  effects: StatusEffects,
  runtime: TelemetryRuntime,
): Promise<TelemetryStatus> => {
  const config = await effects.config.read();
  const telemetryEnabled = isOk(config) ? config.value.telemetryEnabled : undefined;
  return {
    consent: decideTelemetryConsent({
      ...runtime,
      isConfigReadable: isOk(config),
      telemetryEnabled,
    }),
    isEnabledInConfig: telemetryEnabled === true,
    configPath: effects.config.path(),
    configError: isOk(config) ? none : some(config.error),
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
    ...(isSome(status.configError) ? [`Config error: ${status.configError.value.message}`] : []),
  ].join("\n");
};

const formatTelemetryOffReason = (reason: TelemetryOffReason): string =>
  match(reason)
    .with("do-not-track-env", () => "DO_NOT_TRACK environment variable is set")
    .with("kontent-do-not-track-env", () => "KONTENT_DO_NOT_TRACK environment variable is set")
    .with("config-unreadable", () => "the config file could not be read")
    .with("config-disabled", () => "disabled in the config file")
    .with("ci", () => "CI environment detected")
    .with("missing-api-key", () => "this build has no telemetry API key")
    .exhaustive();

type SetEffects = Readonly<{ config: Pick<CliConfigStore, "write"> }>;

const setTelemetry = async (
  effects: SetEffects,
  isEnabled: boolean,
): Promise<Result<void, string>> =>
  effects.config.write({ telemetryEnabled: isEnabled, telemetryNoticeShown: true });
