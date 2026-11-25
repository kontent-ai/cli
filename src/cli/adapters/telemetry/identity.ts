import { randomUUID } from "node:crypto";
import { isErr, isOk } from "../../../core/lib/result.js";
import { createKeyringStorage, type TokenStorage } from "../auth/storage.js";
import { type CliConfigStore, cliConfigStore } from "../config/cliConfig.js";

export type TelemetryIdentity = Readonly<{
  deviceId: string;
  userId?: string;
}>;

export type IdentityEffects = Readonly<{
  tokens: Pick<TokenStorage, "read">;
  config: Pick<CliConfigStore, "read" | "write">;
  newDeviceId: () => string;
}>;

export const resolveIdentity = async (effects: IdentityEffects): Promise<TelemetryIdentity> => {
  const deviceId = await resolveDeviceId(effects);
  const userId = await resolveUserId(effects);
  return userId === null ? { deviceId } : { deviceId, userId };
};

export const systemIdentityEffects = (): IdentityEffects => ({
  tokens: createKeyringStorage(),
  config: cliConfigStore,
  newDeviceId: randomUUID,
});

const resolveDeviceId = async (effects: IdentityEffects): Promise<string> => {
  const config = await effects.config.read();
  const existing = isOk(config) ? config.value.deviceId : undefined;
  if (isValidId(existing)) {
    return existing;
  }
  const deviceId = effects.newDeviceId();
  await effects.config.write({ deviceId });
  return deviceId;
};

// Amplitude rejects user/device ids shorter than 5 characters by default
const MIN_ID_LENGTH = 5;

const isValidId = (value: unknown): value is string =>
  typeof value === "string" && value.length >= MIN_ID_LENGTH;

/**
 * Resolves the cached user id, gated on stored tokens. The cache can outlive its
 * session (failed logout clear, copied config file), so the keyring decides who
 * is logged in.
 */
const resolveUserId = async (effects: IdentityEffects): Promise<string | null> => {
  const stored = await effects.tokens.read();
  if (isErr(stored) || stored.value === null) {
    return null;
  }

  const config = await effects.config.read();
  const cachedUserId = isOk(config) ? config.value.userId : undefined;
  return isValidId(cachedUserId) ? cachedUserId : null;
};
