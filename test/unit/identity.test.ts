import { describe, expect, it, vi } from "vitest";
import type { CliConfig } from "../../src/cli/adapters/config/cliConfig.js";
import {
  type IdentityEffects,
  resolveIdentity,
} from "../../src/cli/adapters/telemetry/identity.js";
import type { AuthError, TokenSet } from "../../src/core/auth/types.js";
import { err, ok } from "../../src/core/lib/result.js";
import { fakeTokenStorage } from "../helpers/authFakes.js";

const TOKENS: TokenSet = { accessToken: "access-token" };

const DEVICE_ID = "device-id-value";
const USER_ID = "user-id-value";
const GENERATED_DEVICE_ID = "generated-device-id";

const effectsWith = (tokens: IdentityEffects["tokens"], config: CliConfig) =>
  ({
    tokens,
    config: {
      read: vi.fn(() => Promise.resolve(config)),
      write: vi.fn(() => Promise.resolve(ok(undefined))),
    },
    newDeviceId: () => GENERATED_DEVICE_ID,
  }) satisfies IdentityEffects;

const failingStorage = (error: AuthError) => ({
  read: vi.fn(() => Promise.resolve(err(error))),
});

describe("resolveIdentity userId gating", () => {
  it("reports the cached userId while tokens are stored", async () => {
    const identity = await resolveIdentity(
      effectsWith(fakeTokenStorage(TOKENS), { deviceId: DEVICE_ID, userId: USER_ID }),
    );

    expect(identity).toEqual({ deviceId: DEVICE_ID, userId: USER_ID });
  });

  it("ignores a userId left in the config once the tokens are gone", async () => {
    const identity = await resolveIdentity(
      effectsWith(fakeTokenStorage(null), { deviceId: DEVICE_ID, userId: USER_ID }),
    );

    expect(identity).not.toHaveProperty("userId");
    expect(identity.deviceId).toBe(DEVICE_ID);
  });

  it("reports no userId when the keyring cannot be read", async () => {
    const identity = await resolveIdentity(
      effectsWith(
        failingStorage({ kind: "storage-read-failed", cause: new Error("no secret service") }),
        { deviceId: DEVICE_ID, userId: USER_ID },
      ),
    );

    expect(identity).not.toHaveProperty("userId");
  });

  it("rejects a cached userId that Amplitude would refuse", async () => {
    const identity = await resolveIdentity(
      effectsWith(fakeTokenStorage(TOKENS), { deviceId: DEVICE_ID, userId: "abc" }),
    );

    expect(identity).not.toHaveProperty("userId");
  });

  it("reports no userId when none was ever cached", async () => {
    const identity = await resolveIdentity(
      effectsWith(fakeTokenStorage(TOKENS), { deviceId: DEVICE_ID }),
    );

    expect(identity).not.toHaveProperty("userId");
  });
});

describe("resolveIdentity deviceId", () => {
  it("keeps an existing deviceId without rewriting the config", async () => {
    const effects = effectsWith(fakeTokenStorage(TOKENS), { deviceId: DEVICE_ID });

    const identity = await resolveIdentity(effects);

    expect(identity.deviceId).toBe(DEVICE_ID);
    expect(effects.config.write).not.toHaveBeenCalled();
  });

  it("generates and persists a deviceId when the config has none", async () => {
    const effects = effectsWith(fakeTokenStorage(TOKENS), {});

    const identity = await resolveIdentity(effects);

    expect(identity.deviceId).toBe(GENERATED_DEVICE_ID);
    expect(effects.config.write).toHaveBeenCalledWith({ deviceId: GENERATED_DEVICE_ID });
  });

  it("survives logout, unlike the userId", async () => {
    const identity = await resolveIdentity(
      effectsWith(fakeTokenStorage(null), { deviceId: DEVICE_ID, userId: USER_ID }),
    );

    expect(identity).toEqual({ deviceId: DEVICE_ID });
  });
});
