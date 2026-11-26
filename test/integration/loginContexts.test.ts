import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  accountFor,
  createKeyringStorage,
  createLegacyTokens,
} from "../../src/cli/adapters/auth/storage.js";
import { logout } from "../../src/cli/commands/logout/runLogout.js";
import { createLogger } from "../../src/cli/log.js";
import { type LoginContext, loginContextFor } from "../../src/core/auth/loginContext.js";
import type { TokenSet } from "../../src/core/auth/types.js";
import { ok } from "../../src/core/lib/result.js";

// The OS keychain, kept in memory by service and account.
const { keychain } = vi.hoisted(() => ({ keychain: new Map<string, string>() }));

vi.mock("@napi-rs/keyring", () => {
  function AsyncEntry(service: string, account: string) {
    const key = JSON.stringify([service, account]);
    return {
      getPassword: async () => keychain.get(key),
      setPassword: async (password: string) => {
        keychain.set(key, password);
        return await Promise.resolve();
      },
      deleteCredential: async () => keychain.delete(key),
    };
  }
  return { AsyncEntry };
});

const PRODUCTION = loginContextFor(
  { domain: "login.example.com", clientId: "client", audience: "https://api.example.com/" },
  { kind: "domain", domain: "kontent.ai" },
);
const QA = loginContextFor(
  {
    domain: "login.qa.example.com",
    clientId: "qa-client",
    audience: "https://api.qa.example.com/",
  },
  { kind: "host", baseUrl: { protocol: "http", host: "localhost:3000" } },
);

const TOKENS: TokenSet = { accessToken: "access-token", expiresAt: Number.MAX_SAFE_INTEGER };

const entryKey = (account: string): string => JSON.stringify(["ai.kontent.cli", account]);
const contextKey = (context: LoginContext): string => entryKey(accountFor(context));
const LEGACY_KEY = entryKey("default");

const logoutOf = async (context: LoginContext) =>
  logout({
    logger: createLogger("none"),
    tokens: createKeyringStorage(context),
    legacyTokens: createLegacyTokens(createLogger("none")),
    config: { write: vi.fn(async () => ok(undefined)) },
  });

describe("logins of different contexts", () => {
  beforeEach(async () => {
    keychain.clear();
    await createKeyringStorage(PRODUCTION).write(TOKENS);
    await createKeyringStorage(QA).write(TOKENS);
  });

  it("logging out of one keeps the other and removes the legacy entry", async () => {
    keychain.set(LEGACY_KEY, JSON.stringify(TOKENS));

    const result = await logoutOf(QA);

    expect(result).toEqual(ok(undefined));
    expect([...keychain.keys()]).toEqual([contextKey(PRODUCTION)]);
  });
});
