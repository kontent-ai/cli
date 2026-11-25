import path from "node:path";
import { KontentSdkError } from "@kontent-ai/core-sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DeliveryKeySummary } from "../../src/cli/adapters/iapi/deliveryKeys.js";
import { prompts } from "../../src/cli/adapters/prompts/prompts.js";
import {
  type BootstrapEffects,
  bootstrap,
  formatBootstrapFailure,
  runBootstrap,
} from "../../src/cli/commands/project/sample/bootstrap/runBootstrap.js";
import { createLogger, type Logger } from "../../src/cli/log.js";
import { none, type Option, some } from "../../src/core/lib/option.js";
import { err, ok } from "../../src/core/lib/result.js";
import { assertErr, assertOk } from "../helpers/assertResult.js";
import { commandDeps } from "../helpers/commandDeps.js";

const ENV_ID = "11111111-2222-3333-4444-555555555555";
const TARGET = "/work/app";

const TEMPLATE = [
  "# Kickstart sample env",
  "VITE_ENVIRONMENT_ID=",
  "VITE_DELIVERY_API_KEY=",
  "VITE_OTHER=keep-me",
  "",
].join("\n");

const EXISTING_KEY: DeliveryKeySummary = {
  tokenSeedId: "seed-123",
  name: "My Key",
  expiresAt: "2030-01-01",
};

type Scenario = Readonly<{
  targetEntries?: ReadonlyArray<string>;
  sampleProjectType?: string;
  keys?: ReadonlyArray<DeliveryKeySummary>;
  confirm?: Option<boolean>;
  select?: Option<string>;
  readError?: string;
  writeError?: string;
}>;

const fakeEffects = (scenario: Scenario = {}) => {
  const files = new Map<string, string>();
  const spinner = () => ({ start: vi.fn(), stop: vi.fn(), error: vi.fn() });
  const effects = {
    logger: createLogger("none"),
    clock: { now: () => Date.UTC(2026, 0, 15) },
    prompts: {
      spinner,
      confirm: vi.fn(async () => scenario.confirm ?? none),
      select: vi.fn(async () => scenario.select ?? none),
      note: vi.fn(),
    },
    files: {
      entries: vi.fn(async () => ok(some(scenario.targetEntries ?? []))),
      readText: vi.fn(async (filePath: string) =>
        scenario.readError === undefined ? ok(fromMap(files, filePath)) : err(scenario.readError),
      ),
      writeText: vi.fn(async (filePath: string, text: string) => {
        if (scenario.writeError !== undefined) {
          return err(scenario.writeError);
        }
        files.set(filePath, text);
        return await Promise.resolve(ok(undefined));
      }),
    },
    projects: {
      info: vi.fn(async () =>
        ok({
          projectName: "My Project",
          projectContainerId: "container-1",
          subscriptionId: "sub-1",
        }),
      ),
      properties: vi.fn(async () =>
        ok([{ key: "SampleProjectType", value: scenario.sampleProjectType ?? "Kickstart" }]),
      ),
    },
    deliveryKeys: {
      list: vi.fn(async () => ok(scenario.keys ?? [EXISTING_KEY])),
      viewApiKey: vi.fn(async () => ok("delivery-secret-abc")),
      create: vi.fn(async () => ok({ name: "new key", apiKey: "new-secret-xyz" })),
    },
    templates: {
      download: vi.fn(async (_source: string, targetDir: string) => {
        files.set(path.join(targetDir, ".env.template"), TEMPLATE);
        return await Promise.resolve(ok(undefined));
      }),
    },
    // Kickstart has no preview space, so nothing here is reached.
    spaces: { list: vi.fn(), create: vi.fn(), modify: vi.fn() },
    previewConfiguration: { read: vi.fn(), write: vi.fn() },
  } satisfies BootstrapEffects;
  return { effects, envLocal: () => files.get(path.join(TARGET, ".env.local")) };
};

const fromMap = (files: ReadonlyMap<string, string>, filePath: string): Option<string> => {
  const text = files.get(filePath);
  return text === undefined ? none : some(text);
};

const params = { envId: ENV_ID, path: TARGET } as const;

describe("bootstrap", () => {
  it("wires .env.local using an existing delivery key the user selects", async () => {
    const { effects, envLocal } = fakeEffects({ select: some("seed-123") });

    const result = await bootstrap(effects, params);

    assertOk(result);
    expect(result.value).toEqual({ subscriptionId: "sub-1", sampleProjectType: "Kickstart" });
    expect(effects.deliveryKeys.viewApiKey).toHaveBeenCalledWith("container-1", "seed-123");
    expect(envLocal()).toContain(`VITE_ENVIRONMENT_ID=${ENV_ID}`);
    expect(envLocal()).toContain("VITE_DELIVERY_API_KEY=delivery-secret-abc");
    expect(envLocal()).toContain("VITE_OTHER=keep-me");
  });

  it("creates a new delivery key when none exist and the user confirms", async () => {
    const { effects, envLocal } = fakeEffects({ keys: [], confirm: some(true) });

    const result = await bootstrap(effects, params);

    assertOk(result);
    expect(effects.deliveryKeys.create).toHaveBeenCalledOnce();
    expect(envLocal()).toContain("VITE_DELIVERY_API_KEY=new-secret-xyz");
  });

  it("aborts when the user cancels the create-key prompt", async () => {
    const { effects } = fakeEffects({ keys: [], confirm: none });

    const result = await bootstrap(effects, params);

    assertErr(result);
    expect(result.error.kind).toBe("aborted");
    expect(effects.templates.download).not.toHaveBeenCalled();
  });

  it("rejects an environment whose SampleProjectType is unsupported", async () => {
    const { effects } = fakeEffects({ sampleProjectType: "Nope" });

    const result = await bootstrap(effects, params);

    assertErr(result);
    expect(result.error.kind).toBe("unsupported-sample");
    expect(effects.templates.download).not.toHaveBeenCalled();
  });

  it("fails when the env template cannot be read", async () => {
    const { effects } = fakeEffects({ select: some("seed-123"), readError: "EACCES" });

    const result = await bootstrap(effects, params);

    assertErr(result);
    expect(result.error).toEqual({ kind: "env-template-read-failed", message: "EACCES" });
    expect(effects.files.writeText).not.toHaveBeenCalled();
  });

  it("fails when .env.local cannot be written", async () => {
    const { effects } = fakeEffects({ select: some("seed-123"), writeError: "disk full" });

    const result = await bootstrap(effects, params);

    assertErr(result);
    expect(result.error).toEqual({ kind: "env-file-write-failed", message: "disk full" });
  });

  it("fails fast when the target directory is not empty, before any API call", async () => {
    const { effects } = fakeEffects({ targetEntries: ["existing.txt"] });

    const result = await bootstrap(effects, params);

    assertErr(result);
    expect(result.error.kind).toBe("target-not-usable");
    expect(effects.projects.info).not.toHaveBeenCalled();
    expect(effects.templates.download).not.toHaveBeenCalled();
  });
});

const httpError = (status: number): KontentSdkError =>
  new KontentSdkError({
    baseErrorData: {
      message: "Failed to execute 'GET' request",
      url: "https://app.example.com/api/project-management/env",
      retryStrategyOptions: undefined,
      retryAttempt: undefined,
    },
    details: {
      reason: "invalidResponse",
      status,
      statusText: "",
      responseHeaders: [],
      kontentErrorResponse: undefined,
      adapterResponse: undefined,
    },
  });

describe("formatBootstrapFailure", () => {
  it("closes an aborted prompt with an outro and exits as cancelled", () => {
    expect(formatBootstrapFailure({ kind: "aborted", message: "Aborted." }, ENV_ID, false)).toEqual(
      {
        message: { channel: "outro", text: "Aborted." },
        outcome: {
          status: "error",
          reason: "cancelled",
          errorCode: "aborted",
          properties: { project: ENV_ID },
        },
      },
    );
  });

  it("asks for a new login when the internal API rejects the login token", () => {
    const failure = formatBootstrapFailure(
      { kind: "project-info-failed", sdkError: httpError(401) },
      ENV_ID,
      false,
    );

    expect(failure.message).toEqual({
      channel: "error",
      text: "Your session is no longer valid. Run `kontent login` to sign in again.",
    });
    expect(failure.outcome).toMatchObject({ reason: "auth-required" });
  });

  it.each([
    { kind: "project-info-failed", sdkError: httpError(403) },
    { kind: "unsupported-sample", sampleValue: "Nope" },
    { kind: "env-template-read-failed", message: "EACCES" },
    { kind: "env-file-write-failed", message: "disk full" },
  ] as const)("reports $kind as an error and a failure", (error) => {
    const failure = formatBootstrapFailure(error, ENV_ID, false);

    expect(failure.message.channel).toBe("error");
    expect(failure.outcome).toMatchObject({ status: "error", reason: "failure" });
  });
});

describe("runBootstrap under an override", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("refuses before any prompt", async () => {
    const intro = vi.spyOn(prompts, "intro").mockImplementation(() => {});
    const logger = {
      info: vi.fn(),
      warning: vi.fn(),
      error: vi.fn(),
      isVerbose: false,
    } satisfies Logger;
    const deps = commandDeps({
      overrides: { kontentTarget: none, auth0: [{ setting: "clientId", value: "qa-client" }] },
    });

    const outcome = await runBootstrap({ envId: ENV_ID, path: TARGET }, deps, logger);

    expect(outcome).toEqual({ status: "error", reason: "failure", errorCode: "override-active" });
    expect(logger.error).toHaveBeenCalledWith(
      "`kontent project sample bootstrap` works only against production Kontent.ai.",
    );
    expect(intro).not.toHaveBeenCalled();
  });
});
