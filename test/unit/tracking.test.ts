import { afterEach, describe, expect, it, vi } from "vitest";
import type { CliConfig, ConfigReadError } from "../../src/cli/adapters/config/cliConfig.js";
import type { TelemetrySink } from "../../src/cli/adapters/telemetry/sink.js";
import {
  createTelemetry,
  type TelemetryEffects,
} from "../../src/cli/adapters/telemetry/tracking.js";
import type { Logger } from "../../src/cli/log.js";
import { err, isErr, ok, type Result } from "../../src/core/lib/result.js";
import type { OptOutVariables } from "../../src/core/telemetry/consent.js";
import { fakeTokenStorage } from "../helpers/authFakes.js";

const KEY = "amplitude-key";
const NO_OPT_OUTS: OptOutVariables = { doNotTrack: undefined, kontentDoNotTrack: undefined };
const SEEN_NOTICE: CliConfig = { telemetryNoticeShown: true };
const CORRUPT: ConfigReadError = {
  message: "Config file at /config/kontent/cli/config.json is not valid JSON. Fix or delete it.",
};

const fakeLogger = (): Logger => ({
  info: () => {},
  warning: () => {},
  error: () => {},
  isVerbose: false,
});

const fakeSink = (flush: () => Promise<void> = async () => undefined) =>
  ({
    track: vi.fn(async () => ({ kind: "accepted", code: 200 }) as const),
    flush: vi.fn(flush),
  }) satisfies TelemetrySink;

// In-memory stand-in for the config file: writes land, and a corrupt file refuses them.
const fakeConfigStore = (initial: Result<CliConfig, ConfigReadError>) => {
  let stored = initial;
  return {
    read: vi.fn(async () => stored),
    write: vi.fn(async (patch: Partial<CliConfig>): Promise<Result<void, string>> => {
      if (isErr(stored)) {
        return await Promise.resolve(err(stored.error.message));
      }
      stored = ok({ ...stored.value, ...patch });
      return await Promise.resolve(ok(undefined));
    }),
  };
};

const effectsWith = (
  overrides: Partial<Omit<TelemetryEffects, "config">> &
    Readonly<{ config?: Result<CliConfig, ConfigReadError> }> = {},
) => {
  const config = fakeConfigStore(overrides.config ?? ok(SEEN_NOTICE));
  const sink = fakeSink();
  const effects = {
    clock: { now: () => 0 },
    identity: { tokens: fakeTokenStorage(null), config, newDeviceId: () => "device-id-value" },
    optOutVariables: NO_OPT_OUTS,
    isCiRun: false,
    isDebug: false,
    amplitudeApiKey: KEY,
    createSink: vi.fn(() => sink),
    ...overrides,
    config,
  } satisfies TelemetryEffects;
  return { effects, sink };
};

const silenceStderr = () => vi.spyOn(process.stderr, "write").mockImplementation(() => true);

const noticeWrites = (stderrWrite: ReturnType<typeof silenceStderr>) =>
  stderrWrite.mock.calls.filter(([chunk]) => String(chunk).includes("anonymous usage telemetry"));

describe("createTelemetry consent", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    {
      name: "DO_NOT_TRACK wins over an enabled config",
      overrides: {
        optOutVariables: { doNotTrack: "1", kontentDoNotTrack: undefined },
        config: ok<CliConfig>({ ...SEEN_NOTICE, telemetryEnabled: true }),
      },
    },
    {
      name: "KONTENT_DO_NOT_TRACK wins over a corrupt config",
      overrides: {
        optOutVariables: { doNotTrack: undefined, kontentDoNotTrack: "1" },
        config: err(CORRUPT),
      },
    },
    {
      name: "a corrupt config wins over an API key",
      overrides: { config: err(CORRUPT) },
    },
    {
      name: "a disabled config wins over CI",
      overrides: { config: ok<CliConfig>({ telemetryEnabled: false }), isCiRun: true },
    },
    {
      name: "CI turns it off",
      overrides: { isCiRun: true },
    },
    {
      name: "a build without an API key turns it off",
      overrides: { amplitudeApiKey: "" },
    },
  ] as const)("$name", async ({ overrides }) => {
    const stderrWrite = silenceStderr();
    const { effects } = effectsWith(overrides);

    await createTelemetry(effects);

    expect(effects.createSink).not.toHaveBeenCalled();
    expect(noticeWrites(stderrWrite)).toHaveLength(0);
  });

  it("is live when nothing opts out and the notice was already shown", async () => {
    silenceStderr();
    const { effects } = effectsWith();

    await createTelemetry(effects);

    expect(effects.createSink).toHaveBeenCalledWith(KEY, expect.any(Number));
  });

  it("sends nothing and writes nothing when the config is corrupt", async () => {
    silenceStderr();
    const { effects, sink } = effectsWith({ config: err(CORRUPT) });

    const { telemetry } = await createTelemetry(effects);
    telemetry.startCommandTracking("login", fakeLogger()).succeed();
    await telemetry.flush();

    expect(sink.track).not.toHaveBeenCalled();
    expect(effects.config.write).not.toHaveBeenCalled();
  });
});

describe("createTelemetry first-run notice", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("is printed once and persisted", async () => {
    const stderrWrite = silenceStderr();
    const { effects } = effectsWith({ config: ok({}) });

    await createTelemetry(effects);
    await createTelemetry(effects);

    expect(effects.createSink).toHaveBeenCalledTimes(2);
    expect(effects.config.write).toHaveBeenCalledOnce();
    expect(effects.config.write).toHaveBeenCalledWith({ telemetryNoticeShown: true });
    expect(noticeWrites(stderrWrite)).toHaveLength(1);
  });
});

describe("telemetry flush", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("returns within the timeout even when the sink never settles", async () => {
    vi.useFakeTimers();
    const { effects } = effectsWith();
    const neverSettling = fakeSink(async () => new Promise<void>(() => {}));
    const { telemetry } = await createTelemetry({
      ...effects,
      createSink: () => neverSettling,
    });
    const onReturned = vi.fn();

    void telemetry.flush().then(onReturned);
    await vi.advanceTimersByTimeAsync(1499);
    expect(onReturned).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    expect(onReturned).toHaveBeenCalled();
    expect(neverSettling.flush).toHaveBeenCalled();
  });
});
