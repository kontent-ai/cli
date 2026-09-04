import { isCI } from "ci-info";
import { match } from "ts-pattern";
import type { Logger } from "../../log.js";
import { readCliConfig, writeCliConfig } from "../config/cliConfig.js";
import { isOk } from "../result.js";
import {
  formatTelemetryOffReason,
  isTelemetryDebug,
  resolveTelemetryConsent,
  type TelemetryOffReason,
} from "./consent.js";
import { amplitudeApiKey } from "./context.js";
import { type CommandOutcome, type EventProperties, toEventType } from "./events.js";
import { resolveIdentity } from "./identity.js";
import {
  createAmplitudeSink,
  createDebugTelemetrySink,
  type TelemetrySink,
  type TrackOutcome,
} from "./sink.js";

const FLUSH_TIMEOUT_MS = 1500;

const FIRST_RUN_NOTICE = `The Kontent.ai CLI sends anonymous usage telemetry (command name, success/failure,
duration) to help improve it. Opt out: kontent telemetry disable`;

export type CommandTracker = Readonly<{
  succeed: (props?: EventProperties) => void;
  fail: (errorCode: string, props?: EventProperties) => void;
}>;

export type Telemetry = Readonly<{
  startCommandTracking: (command: string, logger: Logger) => CommandTracker;
  flush: () => Promise<void>;
}>;

export type TelemetryMode =
  | { readonly kind: "live" }
  | { readonly kind: "disabled"; readonly reason: TelemetryOffReason }
  | { readonly kind: "notice-run"; readonly hasPersistedNotice: boolean }
  | { readonly kind: "debug" }
  | { readonly kind: "init-failed" };

export type TelemetryInit = Readonly<{
  telemetry: Telemetry;
  mode: TelemetryMode;
}>;

const noopTracker: CommandTracker = {
  succeed: () => {},
  fail: () => {},
};

export const noopTelemetry: Telemetry = {
  startCommandTracking: () => noopTracker,
  flush: async () => {},
};

export const createTelemetry = async (): Promise<TelemetryInit> => {
  try {
    const { sink, mode } = await resolveSink();
    if (sink === null) {
      return { telemetry: noopTelemetry, mode };
    }

    const telemetry: Telemetry = {
      startCommandTracking: (command, logger) => {
        const startedAtMs = Date.now();
        let hasFinished = false;

        const finish = (
          outcome: CommandOutcome,
          errorCode?: string,
          props?: EventProperties,
        ): void => {
          if (hasFinished) {
            return;
          }
          hasFinished = true;
          void resolveIdentity()
            .then(async (identity) =>
              sink.track(
                {
                  name: toEventType(command),
                  properties: {
                    outcome,
                    "error-code": errorCode,
                    "duration-ms": Date.now() - startedAtMs,
                    ...props,
                  },
                },
                identity,
              ),
            )
            .then((trackOutcome) => {
              if (trackOutcome.kind !== "skipped") {
                logger.info("verbose", formatTrackOutcome(trackOutcome));
              }
            })
            .catch(() => {
              // telemetry must never affect the command
            });
        };

        return {
          succeed: (props) => finish("success", undefined, props),
          fail: (errorCode, props) => finish("error", errorCode, props),
        };
      },

      flush: async () => {
        try {
          await Promise.race([sink.flush(), delay(FLUSH_TIMEOUT_MS)]);
        } catch {
          // never block or fail exit because of telemetry
        }
      },
    };

    return { telemetry, mode };
  } catch {
    return { telemetry: noopTelemetry, mode: { kind: "init-failed" } };
  }
};

type SinkResolution = Readonly<{
  sink: TelemetrySink | null;
  mode: TelemetryMode;
}>;

const resolveSink = async (): Promise<SinkResolution> => {
  const config = await readCliConfig();
  const consent = resolveTelemetryConsent(process.env, config, amplitudeApiKey, isCI);

  if (isTelemetryDebug(process.env)) {
    const decisionText = consent.isEnabled ? "enabled" : `disabled (${consent.reason})`;
    process.stderr.write(`[telemetry debug] decision: ${decisionText}; nothing will be sent\n`);
    return { sink: createDebugTelemetrySink(), mode: { kind: "debug" } };
  }

  if (!consent.isEnabled) {
    return { sink: null, mode: { kind: "disabled", reason: consent.reason } };
  }

  if (config.telemetryNoticeShown !== true) {
    // Written during createTelemetry(), before yargs runs the handler that
    // produces the event, so the disclosure always precedes the data.
    process.stderr.write(`${FIRST_RUN_NOTICE}\n\n`);
    const persisted = await writeCliConfig({ telemetryNoticeShown: true });
    return {
      sink: createAmplitudeSink(amplitudeApiKey),
      mode: { kind: "notice-run", hasPersistedNotice: isOk(persisted) },
    };
  }

  return { sink: createAmplitudeSink(amplitudeApiKey), mode: { kind: "live" } };
};

export const formatTelemetryMode = (mode: TelemetryMode): string =>
  match(mode)
    .with({ kind: "live" }, () => "Telemetry: enabled")
    .with(
      { kind: "disabled" },
      (m) => `Telemetry: disabled (${formatTelemetryOffReason(m.reason)})`,
    )
    .with({ kind: "notice-run" }, (m) =>
      m.hasPersistedNotice
        ? "Telemetry: enabled (first run, notice shown)"
        : "Telemetry: enabled (first run, notice shown; could not save config, notice will repeat)",
    )
    .with({ kind: "debug" }, () => "Telemetry: debug dry-run (printing payloads, sending nothing)")
    .with({ kind: "init-failed" }, () => "Telemetry: disabled (initialization failed)")
    .exhaustive();

const formatTrackOutcome = (outcome: Exclude<TrackOutcome, { kind: "skipped" }>): string =>
  match(outcome)
    .with({ kind: "accepted" }, (o) => `Telemetry: event accepted (${o.code})`)
    .with({ kind: "rejected" }, (o) => `Telemetry: event rejected (${o.code}: ${o.message})`)
    .exhaustive();

export const registerTelemetrySignalFlush = (telemetry: Telemetry): void => {
  const signals: ReadonlyArray<NodeJS.Signals> = ["SIGINT", "SIGTERM"];
  for (const signal of signals) {
    process.on(signal, () => {
      // process.exit joins the libuv threadpool and never returns while an fs call is blocked
      // there (a FIFO open waiting for a writer), so the signal is re-raised for the kernel to
      // terminate us. Every listener has to go: @clack/prompts holds its own while a spinner
      // runs, and with any left Node keeps catching the signal and the re-raise only re-emits.
      // Dropped before the flush so a second signal kills at once.
      process.removeAllListeners(signal);
      void telemetry.flush().finally(() => {
        process.kill(process.pid, signal);
      });
    });
  }
};

const delay = async (ms: number): Promise<void> =>
  new Promise((resolve) => {
    // unref so a pending timeout never keeps the process alive after the command ends
    setTimeout(resolve, ms).unref();
  });
