import { vi } from "vitest";
import type { Auth0 } from "../../src/cli/adapters/auth/auth0.js";
import type { TokenStorage } from "../../src/cli/adapters/auth/storage.js";
import type { UserIdCache } from "../../src/cli/adapters/auth/userId.js";
import type { AuthError, TokenSet } from "../../src/core/auth/types.js";
import { ok, type Result } from "../../src/core/lib/result.js";

export const fakeTokenStorage = (stored: TokenSet | null) =>
  ({
    read: vi.fn(() => Promise.resolve(ok(stored))),
    write: vi.fn(() => Promise.resolve(ok(undefined))),
    clear: vi.fn(() => Promise.resolve(ok(undefined))),
  }) satisfies TokenStorage;

export const fakeAuth0 = (
  replies: Readonly<{
    refresh?: Result<TokenSet, AuthError>;
    signInWithDeviceFlow?: Result<TokenSet, AuthError>;
  }>,
) =>
  ({
    refresh: vi.fn(() => Promise.resolve(replies.refresh ?? unexpected("refresh"))),
    signInWithDeviceFlow: vi.fn(() =>
      Promise.resolve(replies.signInWithDeviceFlow ?? unexpected("signInWithDeviceFlow")),
    ),
  }) satisfies Auth0;

export const fakeUserIdCache = () =>
  ({
    ensure: vi.fn(() => Promise.resolve()),
  }) satisfies UserIdCache;

const unexpected = (name: string): never => {
  throw new Error(`fakeAuth0.${name} was called without a reply`);
};
