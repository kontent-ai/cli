import { describe, expect, it, vi } from "vitest";
import {
  type LoginEffects,
  login,
  loginFailureOutcome,
} from "../../src/cli/commands/login/runLogin.js";
import { createLogger } from "../../src/cli/log.js";
import type { AuthError, TokenSet } from "../../src/core/auth/types.js";
import { err, ok, type Result } from "../../src/core/lib/result.js";
import {
  fakeDeviceSignIn,
  fakeLegacyTokens,
  fakeTokenStorage,
  fakeUserIdCache,
} from "../helpers/authFakes.js";

const FRESH_TOKENS: TokenSet = {
  accessToken: "new-access-token",
  refreshToken: "new-refresh-token",
  expiresAt: Number.MAX_SAFE_INTEGER,
  identifier: "new@example.com",
};

const EXPIRED: AuthError = {
  kind: "session-expired",
  refreshError: { kind: "refresh-rejected", cause: new Error("invalid_grant") },
};
const TRANSIENT: AuthError = { kind: "refresh-failed", cause: new Error("ETIMEDOUT") };

const effectsWith = (
  replies: Readonly<{ session: Result<TokenSet, AuthError>; signIn?: Result<TokenSet, AuthError> }>,
) =>
  ({
    logger: createLogger("none"),
    session: { tokens: vi.fn(async () => replies.session) },
    tokens: fakeTokenStorage(null),
    legacyTokens: fakeLegacyTokens(),
    deviceSignIn: fakeDeviceSignIn(replies.signIn),
    userIds: fakeUserIdCache(),
  }) satisfies LoginEffects;

describe("login with an expired session", () => {
  it("falls back to the device flow instead of failing the command", async () => {
    const effects = effectsWith({ session: err(EXPIRED), signIn: ok(FRESH_TOKENS) });

    const result = await login(effects);

    expect(effects.deviceSignIn.signIn).toHaveBeenCalledOnce();
    expect(result).toEqual(ok({ isAlreadyAuthenticated: false, identifier: "new@example.com" }));
  });

  it("persists the tokens from the device flow", async () => {
    const effects = effectsWith({ session: err(EXPIRED), signIn: ok(FRESH_TOKENS) });

    await login(effects);

    expect(effects.tokens.write).toHaveBeenCalledWith(FRESH_TOKENS);
    expect(effects.userIds.ensure).toHaveBeenCalledWith("new-access-token", {
      shouldForceRefresh: true,
    });
  });
});

describe("the legacy keyring entry", () => {
  it("is removed once after a fresh sign-in", async () => {
    const effects = effectsWith({
      session: err({ kind: "not-logged-in" }),
      signIn: ok(FRESH_TOKENS),
    });

    await login(effects);

    expect(effects.legacyTokens.remove).toHaveBeenCalledOnce();
  });

  it("stays when the user was already logged in", async () => {
    const effects = effectsWith({ session: ok(FRESH_TOKENS) });

    await login(effects);

    expect(effects.legacyTokens.remove).not.toHaveBeenCalled();
  });

  it("stays when the new tokens cannot be written", async () => {
    const effects = {
      ...effectsWith({ session: err({ kind: "not-logged-in" }), signIn: ok(FRESH_TOKENS) }),
      tokens: {
        write: vi.fn(async () =>
          err({ kind: "storage-write-failed", cause: new Error("locked") } as const),
        ),
      },
    };

    await login(effects);

    expect(effects.legacyTokens.remove).not.toHaveBeenCalled();
  });
});

describe("login when the session fails transiently", () => {
  it("surfaces the error without a device flow", async () => {
    const effects = effectsWith({ session: err(TRANSIENT) });

    const result = await login(effects);

    expect(effects.deviceSignIn.signIn).not.toHaveBeenCalled();
    expect(result).toEqual(err(TRANSIENT));
  });
});

describe("login with a valid session", () => {
  it("does not start a device flow", async () => {
    const effects = effectsWith({ session: ok(FRESH_TOKENS) });

    const result = await login(effects);

    expect(effects.deviceSignIn.signIn).not.toHaveBeenCalled();
    expect(result).toEqual(ok({ isAlreadyAuthenticated: true, identifier: "new@example.com" }));
  });
});

describe("loginFailureOutcome", () => {
  it.each([
    [{ kind: "access-denied" }, "cancelled"],
    [{ kind: "expired-token" }, "failure"],
    [{ kind: "storage-write-failed", cause: new Error("locked") }, "failure"],
  ] as const)("ends %o as %s", (error, reason) => {
    expect(loginFailureOutcome(error)).toEqual({ status: "error", reason, errorCode: error.kind });
  });
});
