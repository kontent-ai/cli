import { randomUUID } from "node:crypto";

import { createKeyringStorage } from "../auth/storage.js";
import { readCliConfig, writeCliConfig } from "../config/cliConfig.js";
import { isErr } from "../result.js";

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

/**
 * Resolves the cached user id, gated on stored tokens. The cache can outlive its
 * session (failed logout clear, copied config file), so the keyring decides who
 * is logged in.
 */
const resolveUserId = async (): Promise<string | null> => {
  const stored = await createKeyringStorage().read();
  if (isErr(stored) || stored.value === null) {
    return null;
  }

  const cachedUserId = (await readCliConfig()).userId;
  return isValidId(cachedUserId) ? cachedUserId : null;
};
