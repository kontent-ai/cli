import { describe, expect, it, vi } from "vitest";
import { createLegacyTokens } from "../../src/cli/adapters/auth/storage.js";
import type { CliConfigStore } from "../../src/cli/adapters/config/cliConfig.js";
import { type LogoutEffects, logout } from "../../src/cli/commands/logout/runLogout.js";
import type { Logger } from "../../src/cli/log.js";
import type { AuthError } from "../../src/core/auth/types.js";
import { err, ok } from "../../src/core/lib/result.js";
import { fakeLegacyTokens, fakeTokenStorage } from "../helpers/authFakes.js";

// A keychain that refuses every call, for the legacy delete's failure path.
vi.mock("@napi-rs/keyring", () => ({
  AsyncEntry: function AsyncEntry() {
    return { getPassword: async () => Promise.reject(new Error("keychain locked")) };
  },
}));

const CORRUPT =
  "Config file at /config/kontent/cli/config.json is not valid JSON. Fix or delete it.";

const CLEAR_FAILED: AuthError = { kind: "storage-clear-failed", cause: new Error("locked") };

const fakeLogger = () =>
  ({
    info: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    isVerbose: false,
  }) satisfies Logger;

const effectsWith = (write: CliConfigStore["write"]) =>
  ({
    logger: fakeLogger(),
    tokens: fakeTokenStorage(null),
    legacyTokens: fakeLegacyTokens(),
    config: { write: vi.fn(write) },
  }) satisfies LogoutEffects;

describe("logout", () => {
  it("clears the keyring and drops the previous user's id and default environment", async () => {
    const effects = effectsWith(async () => await Promise.resolve(ok(undefined)));

    const result = await logout(effects);

    expect(result).toEqual(ok(undefined));
    expect(effects.tokens.clear).toHaveBeenCalledOnce();
    expect(effects.config.write).toHaveBeenCalledWith({ userId: undefined, envId: undefined });
    expect(effects.logger.warning).not.toHaveBeenCalled();
  });

  // Deleting the file would also delete a telemetry opt-out, so logout only warns.
  it("still clears the keyring with an unreadable config and says what stays behind", async () => {
    const effects = effectsWith(async () => await Promise.resolve(err(CORRUPT)));

    const result = await logout(effects);

    expect(result).toEqual(ok(undefined));
    expect(effects.tokens.clear).toHaveBeenCalledOnce();
    expect(effects.logger.warning).toHaveBeenCalledWith(
      "standard",
      `Could not clear the stored default environment and user ID; they stay in the config file: ${CORRUPT}`,
    );
  });

  it("warns but succeeds when the config write fails", async () => {
    const effects = effectsWith(async () => await Promise.resolve(err("EACCES")));

    const result = await logout(effects);

    expect(result).toEqual(ok(undefined));
    expect(effects.logger.warning).toHaveBeenCalledWith(
      "standard",
      "Could not clear the stored default environment and user ID; they stay in the config file: EACCES",
    );
  });

  it("returns the error when clearing the tokens fails", async () => {
    const effects = {
      ...effectsWith(async () => await Promise.resolve(ok(undefined))),
      tokens: { clear: vi.fn(async () => await Promise.resolve(err(CLEAR_FAILED))) },
    } satisfies LogoutEffects;

    const result = await logout(effects);

    expect(result).toEqual(err(CLEAR_FAILED));
    expect(effects.config.write).not.toHaveBeenCalled();
  });
});

describe("logout when the legacy keyring entry cannot be removed", () => {
  it("still succeeds and says why at verbose", async () => {
    const logger = {
      info: vi.fn(),
      warning: vi.fn(),
      error: vi.fn(),
      isVerbose: true,
    } satisfies Logger;

    const result = await logout({
      logger,
      tokens: fakeTokenStorage(null),
      legacyTokens: createLegacyTokens(logger),
      config: { write: vi.fn(async () => ok(undefined)) },
    });

    expect(result).toEqual(ok(undefined));
    expect(logger.warning).toHaveBeenCalledWith(
      "verbose",
      "Could not remove the old keyring entry: keychain locked",
    );
  });
});
