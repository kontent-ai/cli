import { describe, expect, it } from "vitest";
import { type LoginEffects, login } from "../../src/cli/commands/login/runLogin.js";
import { createLogger } from "../../src/cli/log.js";
import type { AuthError, TokenSet } from "../../src/core/auth/types.js";
import { err, ok } from "../../src/core/lib/result.js";
import { fakeAuth0, fakeTokenStorage, fakeUserIdCache } from "../helpers/authFakes.js";

const EXPIRED_TOKENS: TokenSet = {
  accessToken: "stale-access-token",
  refreshToken: "stale-refresh-token",
  expiresAt: 0,
  identifier: "old@example.com",
};

const FRESH_TOKENS: TokenSet = {
  accessToken: "new-access-token",
  refreshToken: "new-refresh-token",
  expiresAt: Number.MAX_SAFE_INTEGER,
  identifier: "new@example.com",
};

const REJECTED: AuthError = { kind: "refresh-rejected", cause: new Error("invalid_grant") };
const TRANSIENT: AuthError = { kind: "refresh-failed", cause: new Error("ETIMEDOUT") };

const effectsWith = (auth: ReturnType<typeof fakeAuth0>) =>
  ({
    logger: createLogger("none"),
    clock: { now: () => 1_000 },
    tokens: fakeTokenStorage(EXPIRED_TOKENS),
    auth,
    userIds: fakeUserIdCache(),
  }) satisfies LoginEffects;

describe("login with a rejected refresh token", () => {
  const rejectedAuth = () =>
    fakeAuth0({ refresh: err(REJECTED), signInWithDeviceFlow: ok(FRESH_TOKENS) });

  it("falls back to the device flow instead of failing the command", async () => {
    const effects = effectsWith(rejectedAuth());

    const result = await login(effects);

    expect(effects.auth.signInWithDeviceFlow).toHaveBeenCalledOnce();
    expect(result).toEqual(ok({ isAlreadyAuthenticated: false, identifier: "new@example.com" }));
  });

  it("clears the dead tokens and persists the ones from the device flow", async () => {
    const effects = effectsWith(rejectedAuth());

    await login(effects);

    expect(effects.tokens.clear).toHaveBeenCalledOnce();
    expect(effects.tokens.write).toHaveBeenCalledWith(FRESH_TOKENS);
    expect(effects.userIds.ensure).toHaveBeenCalledWith("new-access-token", {
      shouldForceRefresh: true,
    });
  });
});

describe("login when the refresh fails transiently", () => {
  it("keeps the stored session and surfaces the error without a device flow", async () => {
    const effects = effectsWith(fakeAuth0({ refresh: err(TRANSIENT) }));

    const result = await login(effects);

    expect(effects.auth.signInWithDeviceFlow).not.toHaveBeenCalled();
    expect(effects.tokens.clear).not.toHaveBeenCalled();
    expect(result).toEqual(err(TRANSIENT));
  });
});

describe("login when the refresh succeeds", () => {
  it("does not start a device flow", async () => {
    const effects = effectsWith(fakeAuth0({ refresh: ok(FRESH_TOKENS) }));

    const result = await login(effects);

    expect(effects.auth.signInWithDeviceFlow).not.toHaveBeenCalled();
    expect(result).toEqual(ok({ isAlreadyAuthenticated: false, identifier: "new@example.com" }));
  });
});
