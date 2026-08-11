import { describe, expect, it, vi } from "vitest";
import { createKeyringStorage } from "../../src/lib/auth/storage.js";
import type { AuthError, TokenSet } from "../../src/lib/auth/types.js";
import { readCliConfig, writeCliConfig } from "../../src/lib/config/cliConfig.js";
import { err, ok } from "../../src/lib/result.js";
import { resolveIdentity } from "../../src/lib/telemetry/identity.js";

vi.mock("../../src/lib/auth/storage.js", () => ({
  createKeyringStorage: vi.fn(),
}));

vi.mock("../../src/lib/config/cliConfig.js", () => ({
  readCliConfig: vi.fn(),
  writeCliConfig: vi.fn(),
}));

const TOKENS: TokenSet = { accessToken: "access-token" };

const DEVICE_ID = "device-id-value";
const USER_ID = "user-id-value";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const fakeStorage = (stored: TokenSet | null) => ({
  read: vi.fn(async () => ok(stored)),
  write: vi.fn(async () => ok(undefined)),
  clear: vi.fn(async () => ok(undefined)),
});

const failingStorage = (error: AuthError) => ({
  read: vi.fn(async () => err(error)),
  write: vi.fn(async () => ok(undefined)),
  clear: vi.fn(async () => ok(undefined)),
});

describe("resolveIdentity userId gating", () => {
  it("reports the cached userId while tokens are stored", async () => {
    vi.mocked(createKeyringStorage).mockReturnValue(fakeStorage(TOKENS));
    vi.mocked(readCliConfig).mockResolvedValue({ deviceId: DEVICE_ID, userId: USER_ID });

    const identity = await resolveIdentity();

    expect(identity).toEqual({ deviceId: DEVICE_ID, userId: USER_ID });
  });

  it("ignores a userId left in the config once the tokens are gone", async () => {
    vi.mocked(createKeyringStorage).mockReturnValue(fakeStorage(null));
    vi.mocked(readCliConfig).mockResolvedValue({ deviceId: DEVICE_ID, userId: USER_ID });

    const identity = await resolveIdentity();

    expect(identity).not.toHaveProperty("userId");
    expect(identity.deviceId).toBe(DEVICE_ID);
  });

  it("reports no userId when the keyring cannot be read", async () => {
    vi.mocked(createKeyringStorage).mockReturnValue(
      failingStorage({ kind: "storage-read-failed", cause: new Error("no secret service") }),
    );
    vi.mocked(readCliConfig).mockResolvedValue({ deviceId: DEVICE_ID, userId: USER_ID });

    const identity = await resolveIdentity();

    expect(identity).not.toHaveProperty("userId");
  });

  it("rejects a cached userId that Amplitude would refuse", async () => {
    vi.mocked(createKeyringStorage).mockReturnValue(fakeStorage(TOKENS));
    vi.mocked(readCliConfig).mockResolvedValue({ deviceId: DEVICE_ID, userId: "abc" });

    const identity = await resolveIdentity();

    expect(identity).not.toHaveProperty("userId");
  });

  it("reports no userId when none was ever cached", async () => {
    vi.mocked(createKeyringStorage).mockReturnValue(fakeStorage(TOKENS));
    vi.mocked(readCliConfig).mockResolvedValue({ deviceId: DEVICE_ID });

    const identity = await resolveIdentity();

    expect(identity).not.toHaveProperty("userId");
  });
});

describe("resolveIdentity deviceId", () => {
  it("keeps an existing deviceId without rewriting the config", async () => {
    vi.mocked(createKeyringStorage).mockReturnValue(fakeStorage(TOKENS));
    vi.mocked(readCliConfig).mockResolvedValue({ deviceId: DEVICE_ID });

    const identity = await resolveIdentity();

    expect(identity.deviceId).toBe(DEVICE_ID);
    expect(writeCliConfig).not.toHaveBeenCalled();
  });

  it("generates and persists a deviceId when the config has none", async () => {
    vi.mocked(createKeyringStorage).mockReturnValue(fakeStorage(TOKENS));
    vi.mocked(readCliConfig).mockResolvedValue({});
    vi.mocked(writeCliConfig).mockResolvedValue(ok(undefined));

    const identity = await resolveIdentity();

    expect(identity.deviceId).toMatch(UUID_PATTERN);
    expect(writeCliConfig).toHaveBeenCalledWith({ deviceId: identity.deviceId });
  });

  it("survives logout, unlike the userId", async () => {
    vi.mocked(createKeyringStorage).mockReturnValue(fakeStorage(null));
    vi.mocked(readCliConfig).mockResolvedValue({ deviceId: DEVICE_ID, userId: USER_ID });

    const identity = await resolveIdentity();

    expect(identity).toEqual({ deviceId: DEVICE_ID });
  });
});
