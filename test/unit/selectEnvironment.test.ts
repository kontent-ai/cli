import { describe, expect, it, vi } from "vitest";
import type {
  EnvironmentInfo,
  MapiRequestError,
} from "../../src/cli/adapters/mapi/environments.js";
import {
  formatUseFailure,
  selectEnvironment,
  type UseEffects,
} from "../../src/cli/commands/environment/runEnvironment.js";
import type { AuthError, TokenSet } from "../../src/core/auth/types.js";
import { err, ok, type Result } from "../../src/core/lib/result.js";

const ENV_ID = "11111111-2222-3333-4444-555555555555";
const INFO: EnvironmentInfo = { projectName: "Blog", environmentName: "Production" };
const NOT_FOUND: MapiRequestError = { status: 404, message: "Not found" };
const STORAGE_FAILURE: AuthError = { kind: "storage-read-failed", cause: new Error("locked") };

const fakeEffects = (
  tokens: Result<TokenSet, AuthError>,
  described: Result<EnvironmentInfo, MapiRequestError> = ok(INFO),
) =>
  ({
    session: { tokens: vi.fn(async () => tokens) },
    environments: { describe: vi.fn(async () => described) },
    config: { write: vi.fn(async () => ok(undefined)) },
  }) satisfies UseEffects;

describe("selectEnvironment", () => {
  it("verifies the id, then saves the trimmed id when logged in", async () => {
    const effects = fakeEffects(ok({ accessToken: "token" }));

    const result = await selectEnvironment(effects, `  ${ENV_ID}  `);

    expect(effects.environments.describe).toHaveBeenCalledWith(ENV_ID, "token");
    expect(effects.config.write).toHaveBeenCalledWith({ envId: ENV_ID });
    expect(result).toEqual(ok({ kind: "verified", envId: ENV_ID, ...INFO }));
  });

  it("does not save an id that failed verification", async () => {
    const effects = fakeEffects(ok({ accessToken: "token" }), err(NOT_FOUND));

    const result = await selectEnvironment(effects, ENV_ID);

    expect(effects.config.write).not.toHaveBeenCalled();
    expect(result).toEqual(err({ kind: "environment-info-failed", ...NOT_FOUND }));
  });

  it("saves the id unverified on any other auth failure", async () => {
    const effects = fakeEffects(err(STORAGE_FAILURE));

    const result = await selectEnvironment(effects, ENV_ID);

    expect(effects.environments.describe).not.toHaveBeenCalled();
    expect(effects.config.write).toHaveBeenCalledWith({ envId: ENV_ID });
    expect(result).toEqual(ok({ kind: "unverified", envId: ENV_ID, reason: STORAGE_FAILURE }));
  });

  it("saves the id unverified when not logged in", async () => {
    const effects = fakeEffects(err({ kind: "not-logged-in" }));

    const result = await selectEnvironment(effects, ENV_ID);

    expect(effects.environments.describe).not.toHaveBeenCalled();
    expect(effects.config.write).toHaveBeenCalledWith({ envId: ENV_ID });
    expect(result).toEqual(
      ok({ kind: "unverified", envId: ENV_ID, reason: { kind: "not-logged-in" } }),
    );
  });
});

describe("formatUseFailure", () => {
  it("asks for a new login when the Management API rejects the login token", () => {
    expect(
      formatUseFailure({ kind: "environment-info-failed", status: 401, message: "" }, ENV_ID),
    ).toEqual({
      message: "Your session is no longer valid. Run `kontent login` to sign in again.",
      outcome: { status: "error", reason: "auth-required", errorCode: "environment-info-failed" },
    });
  });

  it.each([
    { kind: "environment-info-failed", status: 404, message: "Not found" },
    { kind: "config-write-failed", message: "EACCES" },
  ] as const)("fails without asking for a login on $kind $status", (error) => {
    expect(formatUseFailure(error, ENV_ID).outcome).toEqual({
      status: "error",
      reason: "failure",
      errorCode: error.kind,
    });
  });
});
