import { describe, expect, it, vi } from "vitest";
import type { CliConfig } from "../../src/cli/adapters/config/cliConfig.js";
import {
  type IdentityEffects,
  resolveIdentity,
} from "../../src/cli/adapters/telemetry/identity.js";
import { ok } from "../../src/core/lib/result.js";

const DEVICE_ID = "device-id-value";
const USER_ID = "user-id-value";
const GENERATED_DEVICE_ID = "generated-device-id";

const effectsWith = (config: CliConfig) =>
  ({
    config: {
      read: vi.fn(async () => ok(config)),
      write: vi.fn(async () => ok(undefined)),
    },
    newDeviceId: () => GENERATED_DEVICE_ID,
  }) satisfies IdentityEffects;

describe("resolveIdentity userId", () => {
  it("reports the cached userId", async () => {
    const identity = await resolveIdentity(effectsWith({ deviceId: DEVICE_ID, userId: USER_ID }));

    expect(identity).toEqual({ deviceId: DEVICE_ID, userId: USER_ID });
  });

  it("rejects a cached userId that Amplitude would refuse", async () => {
    const identity = await resolveIdentity(effectsWith({ deviceId: DEVICE_ID, userId: "abc" }));

    expect(identity).not.toHaveProperty("userId");
  });

  it("reports no userId when none was ever cached", async () => {
    const identity = await resolveIdentity(effectsWith({ deviceId: DEVICE_ID }));

    expect(identity).not.toHaveProperty("userId");
  });
});

describe("resolveIdentity deviceId", () => {
  it("keeps an existing deviceId without rewriting the config", async () => {
    const effects = effectsWith({ deviceId: DEVICE_ID });

    const identity = await resolveIdentity(effects);

    expect(identity.deviceId).toBe(DEVICE_ID);
    expect(effects.config.write).not.toHaveBeenCalled();
  });

  it("generates and persists a deviceId when the config has none", async () => {
    const effects = effectsWith({});

    const identity = await resolveIdentity(effects);

    expect(identity.deviceId).toBe(GENERATED_DEVICE_ID);
    expect(effects.config.write).toHaveBeenCalledWith({ deviceId: GENERATED_DEVICE_ID });
  });
});
