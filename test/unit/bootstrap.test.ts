import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { DeliveryKeySummary } from "../../src/cli/adapters/iapi/deliveryKeys.js";
import {
  type BootstrapEffects,
  bootstrap,
} from "../../src/cli/commands/project/sample/bootstrap/runBootstrap.js";
import { createLogger } from "../../src/cli/log.js";
import { none, type Option, some } from "../../src/core/lib/option.js";
import { ok } from "../../src/core/lib/result.js";
import { assertErr, assertOk } from "../helpers/assertResult.js";

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
}>;

const fakeEffects = (scenario: Scenario = {}) => {
  const files = new Map<string, string>();
  const spinner = () => ({ start: vi.fn(), stop: vi.fn(), error: vi.fn() });
  const effects = {
    logger: createLogger("none"),
    clock: { now: () => Date.UTC(2026, 0, 15) },
    prompts: {
      spinner,
      confirm: vi.fn(() => Promise.resolve(scenario.confirm ?? none)),
      select: vi.fn(() => Promise.resolve(scenario.select ?? none)),
      note: vi.fn(),
    },
    files: {
      entries: vi.fn(() => Promise.resolve(ok(some(scenario.targetEntries ?? [])))),
      readText: vi.fn((filePath: string) => Promise.resolve(ok(fromMap(files, filePath)))),
      writeText: vi.fn((filePath: string, text: string) => {
        files.set(filePath, text);
        return Promise.resolve(ok(undefined));
      }),
    },
    projects: {
      info: vi.fn(() =>
        Promise.resolve(
          ok({
            projectName: "My Project",
            projectContainerId: "container-1",
            subscriptionId: "sub-1",
          }),
        ),
      ),
      properties: vi.fn(() =>
        Promise.resolve(
          ok([{ key: "SampleProjectType", value: scenario.sampleProjectType ?? "Kickstart" }]),
        ),
      ),
    },
    deliveryKeys: {
      list: vi.fn(() => Promise.resolve(ok(scenario.keys ?? [EXISTING_KEY]))),
      viewApiKey: vi.fn(() => Promise.resolve(ok("delivery-secret-abc"))),
      create: vi.fn(() => Promise.resolve(ok({ name: "new key", apiKey: "new-secret-xyz" }))),
    },
    templates: {
      download: vi.fn((_source: string, targetDir: string) => {
        files.set(path.join(targetDir, ".env.template"), TEMPLATE);
        return Promise.resolve(ok(undefined));
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

  it("fails fast when the target directory is not empty, before any API call", async () => {
    const { effects } = fakeEffects({ targetEntries: ["existing.txt"] });

    const result = await bootstrap(effects, params);

    assertErr(result);
    expect(result.error.kind).toBe("target-not-usable");
    expect(effects.projects.info).not.toHaveBeenCalled();
    expect(effects.templates.download).not.toHaveBeenCalled();
  });
});
