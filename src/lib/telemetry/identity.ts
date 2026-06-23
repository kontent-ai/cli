import { randomUUID } from "node:crypto";

import { readCliConfig, writeCliConfig } from "../config/cliConfig.js";

export type TelemetryIdentity = Readonly<{
  deviceId: string;
  userId?: string;
}>;

// Amplitude rejects user/device ids shorter than 5 characters by default
const MIN_ID_LENGTH = 5;

export const resolveIdentity = async (): Promise<TelemetryIdentity> => {
  const deviceId = await resolveDeviceId();
  const userId = await resolveUserId();
  return userId === null ? { deviceId } : { deviceId, userId };
};

const isValidId = (value: unknown): value is string =>
  typeof value === "string" && value.length >= MIN_ID_LENGTH;

const resolveDeviceId = async (): Promise<string> => {
  const existing = (await readCliConfig()).deviceId;
  if (isValidId(existing)) {
    return existing;
  }
  const deviceId = randomUUID();
  await writeCliConfig({ deviceId });
  return deviceId;
};

const resolveUserId = async (): Promise<string | null> => {
  const cachedUserId = (await readCliConfig()).userId;
  return isValidId(cachedUserId) ? cachedUserId : null;
};
