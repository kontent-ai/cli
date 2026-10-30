import { describe, expect, it, vi } from "vitest";
import { type LoginEffects, login } from "../../src/cli/commands/login/runLogin.js";
import { createLogger } from "../../src/cli/log.js";
import type { AuthError, TokenSet } from "../../src/core/auth/types.js";
import { err, ok, type Result } from "../../src/core/lib/result.js";
import { fakeDeviceSignIn, fakeTokenStorage, fakeUserIdCache } from "../helpers/authFakes.js";

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
    session: { tokens: vi.fn(() => Promise.resolve(replies.session)) },
    tokens: fakeTokenStorage(null),
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
