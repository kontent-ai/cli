import { vi } from "vitest";
import type { DeviceSignIn, TokenRefresh } from "../../src/cli/adapters/auth/auth0.js";
import type { LegacyEntry, TokenStorage } from "../../src/cli/adapters/auth/storage.js";
import type { UserIdCache } from "../../src/cli/adapters/auth/userId.js";
import type { AuthError, TokenSet } from "../../src/core/auth/types.js";
import { ok, type Result } from "../../src/core/lib/result.js";

export const fakeTokenStorage = (stored: TokenSet | null) =>
  ({
    read: vi.fn(async () => ok(stored)),
    write: vi.fn(async () => ok(undefined)),
    clear: vi.fn(async () => ok(undefined)),
  }) satisfies TokenStorage;

export const fakeLegacyTokens = () =>
  ({
    remove: vi.fn(async () => undefined),
  }) satisfies LegacyEntry;

export const fakeTokenRefresh = (reply?: Result<TokenSet, AuthError>) =>
  ({
    refresh: vi.fn(async () => reply ?? unexpected("tokenRefresh.refresh")),
  }) satisfies TokenRefresh;

export const fakeDeviceSignIn = (reply?: Result<TokenSet, AuthError>) =>
  ({
    signIn: vi.fn(async () => reply ?? unexpected("deviceSignIn.signIn")),
  }) satisfies DeviceSignIn;

export const fakeUserIdCache = () =>
  ({
    ensure: vi.fn(async () => undefined),
  }) satisfies UserIdCache;

const unexpected = (name: string): never => {
  throw new Error(`${name} was called without a reply`);
};
