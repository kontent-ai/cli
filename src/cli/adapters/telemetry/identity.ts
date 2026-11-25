import { randomUUID } from "node:crypto";
import { isOk } from "../../../core/lib/result.js";
import type { CliConfigStore } from "../config/cliConfig.js";

export type TelemetryIdentity = Readonly<{
  deviceId: string;
  userId?: string;
}>;

export type IdentityEffects = Readonly<{
  config: Pick<CliConfigStore, "read" | "write">;
  newDeviceId: () => string;
}>;

export const resolveIdentity = async (effects: IdentityEffects): Promise<TelemetryIdentity> => {
  const deviceId = await resolveDeviceId(effects);
  const config = await effects.config.read();
  const userId = isOk(config) ? config.value.userId : undefined;
  return isValidId(userId) ? { deviceId, userId } : { deviceId };
};

export const systemIdentityEffects = (config: CliConfigStore): IdentityEffects => ({
  config,
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
