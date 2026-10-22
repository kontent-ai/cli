import { describe, expect, it, vi } from "vitest";
import type { RawResponse } from "../../src/cli/adapters/mapi/raw/client.js";
import {
  type RequestEffects,
  type RequestInput,
  request,
} from "../../src/cli/commands/mapi/request/runRequest.js";
import type { Logger } from "../../src/cli/log.js";
import type { AuthError } from "../../src/core/auth/types.js";
import { err, ok, type Result } from "../../src/core/lib/result.js";
import { assertErr, assertOk } from "../helpers/assertResult.js";

const ENV_ID = "11111111-2222-3333-4444-555555555555";
const STORED_ENV_ID = "99999999-8888-7777-6666-555555555555";
const OK_RESPONSE: RawResponse = {
  status: 200,
  statusText: "OK",
  responseHeaders: [],
  payload: { types: [] },
};

const fakeLogger = () => {
  const infos: string[] = [];
  const logger: Logger = {
    info: (_level, ...messages) => infos.push(messages.join(" ")),
    warning: () => {},
    error: () => {},
    isVerbose: false,
  };
  return { logger, infos };
};

const fakeEffects = (
  options: Readonly<{
    storedEnvId?: string;
    body?: Result<Blob, { kind: "unreadable-input"; message: string }>;
    accessToken?: Result<string, AuthError>;
    sent?: Result<RawResponse, string>;
  }> = {},
) => {
  const { logger, infos } = fakeLogger();
  const effects = {
    logger,
    config: { read: vi.fn(() => Promise.resolve({ envId: options.storedEnvId })) },
    bodyReader: { read: vi.fn(() => Promise.resolve(options.body ?? ok(new Blob(["{}"])))) },
    session: {
      accessToken: vi.fn(() => Promise.resolve(options.accessToken ?? ok("login-token"))),
    },
    mapi: {
      send: vi.fn(() => Promise.resolve(options.sent ?? ok(OK_RESPONSE))),
    },
  } satisfies RequestEffects;
  return { effects, infos };
};

const input = (overrides: Partial<RequestInput> = {}): RequestInput => ({
  endpoint: "types",
  baseUrl: "https://manage.test/v2",
  envId: ENV_ID,
  ...overrides,
});

describe("request", () => {
  it("prefers --envId over the stored environment without reading the config", async () => {
    const { effects } = fakeEffects({ storedEnvId: STORED_ENV_ID });

    const result = await request(effects, input());

    assertOk(result);
    expect(result.value.env).toEqual({ envId: ENV_ID, source: "flag" });
    expect(effects.config.read).not.toHaveBeenCalled();
  });

  it("falls back to the stored environment and announces it", async () => {
    const { effects, infos } = fakeEffects({ storedEnvId: STORED_ENV_ID });

    const result = await request(effects, input({ envId: undefined }));

    assertOk(result);
    expect(result.value.env).toEqual({ envId: STORED_ENV_ID, source: "stored" });
    expect(infos).toContain(`Using the stored default environment ${STORED_ENV_ID}.`);
  });

  it("sends nothing without an environment", async () => {
    const { effects } = fakeEffects();

    const result = await request(effects, input({ envId: undefined }));

    expect(result).toEqual(err({ kind: "missing-env-id" }));
    expect(effects.mapi.send).not.toHaveBeenCalled();
  });

  it("does not read the input for a GET that cannot carry it", async () => {
    const { effects } = fakeEffects();

    const result = await request(effects, input({ method: "GET", input: "body.json" }));

    assertErr(result);
    expect(result.error.kind).toBe("invalid-method");
    expect(effects.bodyReader.read).not.toHaveBeenCalled();
    expect(effects.mapi.send).not.toHaveBeenCalled();
  });

  it("sends nothing when the input cannot be read", async () => {
    const unreadable = { kind: "unreadable-input", message: "Failed to read" } as const;
    const { effects } = fakeEffects({ body: err(unreadable) });

    const result = await request(effects, input({ input: "body.json" }));

    expect(result).toEqual(err(unreadable));
    expect(effects.mapi.send).not.toHaveBeenCalled();
  });

  it("sends nothing when no credential is found", async () => {
    const { effects } = fakeEffects({ accessToken: err({ kind: "not-logged-in" }) });

    const result = await request(effects, input());

    expect(result).toEqual(err({ kind: "auth-failed", error: { kind: "not-logged-in" } }));
    expect(effects.mapi.send).not.toHaveBeenCalled();
  });

  it("sends a caller's Authorization header without touching the login", async () => {
    const { effects } = fakeEffects();

    const result = await request(effects, input({ header: ["Authorization: Bearer mine"] }));

    assertOk(result);
    expect(result.value.authSource).toBe("header");
    expect(effects.session.accessToken).not.toHaveBeenCalled();
    expect(effects.mapi.send).toHaveBeenCalledWith(expect.anything(), undefined);
  });

  it("sends the file body with the method --input implies", async () => {
    const { effects } = fakeEffects();

    await request(effects, input({ input: "body.json" }));

    expect(effects.mapi.send).toHaveBeenCalledWith(
      expect.objectContaining({ method: "POST", body: expect.any(Blob) }),
      "login-token",
    );
  });

  it("reports a transport failure with the credential it used", async () => {
    const { effects } = fakeEffects({ sent: err("fetch failed: getaddrinfo ENOTFOUND") });

    const result = await request(effects, input({ mapiKey: "key" }));

    expect(result).toEqual(
      err({
        kind: "transport",
        message: "fetch failed: getaddrinfo ENOTFOUND",
        authSource: "mapi-key",
      }),
    );
  });
});
