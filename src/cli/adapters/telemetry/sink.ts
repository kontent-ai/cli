import os from "node:os";

import { createInstance, Types } from "@amplitude/analytics-node";
import type { TelemetryEvent } from "../../../core/telemetry/events.js";
import { cliVersion } from "./context.js";
import type { TelemetryIdentity } from "./identity.js";
import { createBoundedTransport } from "./transport.js";

export type TrackOutcome =
  | { readonly kind: "accepted"; readonly code: number }
  | { readonly kind: "rejected"; readonly code: number; readonly message: string }
  | { readonly kind: "skipped" };

export type TelemetrySink = Readonly<{
  track: (event: TelemetryEvent, identity: TelemetryIdentity) => Promise<TrackOutcome>;
  flush: () => Promise<void>;
}>;

export const createDebugTelemetrySink = (): TelemetrySink => ({
  // biome-ignore lint/suspicious/useAwait: async required by the TelemetrySink interface
  track: async (event, identity) => {
    const line = JSON.stringify({
      name: event.name,
      identity,
      properties: event.properties,
    });
    process.stderr.write(`[telemetry debug] ${line}\n`);
    return { kind: "skipped" };
  },
  flush: async () => {},
});

export const createAmplitudeSink = (apiKey: string, requestTimeoutMs: number): TelemetrySink => {
  const client = createInstance();
  // Not awaited on purpose: events tracked before init resolves are queued internally.
  client.init(apiKey, {
    serverZone: "US",
    // The CLI process is short-lived; the default thresholds (300 events / 10 s)
    // would never fire before exit.
    flushQueueSize: 1,
    // 0 sends an event as soon as it is tracked. With a delay the event still waits on the
    // SDK's ref'd timer when the exit flush runs, so that flush returns at once and the timer
    // then holds the process open for the delay plus the request timeout.
    flushIntervalMillis: 0,
    flushMaxRetries: 1,
    logLevel: Types.LogLevel.None,
    transportProvider: createBoundedTransport(requestTimeoutMs),
  });

  return {
    track: async (event, identity) => {
      const result = await client.track(event.name, event.properties, toEventOptions(identity))
        .promise;
      if (result.code === 200) {
        return { kind: "accepted", code: result.code };
      }
      return { kind: "rejected", code: result.code, message: result.message };
    },
    flush: async () => {
      await client.flush().promise;
    },
  };
};

const toEventOptions = (identity: TelemetryIdentity): Types.EventOptions => ({
  device_id: identity.deviceId,
  ...(identity.userId !== undefined ? { user_id: identity.userId } : {}),
  platform: "CLI",
  app_version: cliVersion,
  os_name: os.platform(),
  os_version: os.release(),
});
