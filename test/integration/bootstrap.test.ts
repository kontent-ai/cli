import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { confirm, isCancel, select } from "@clack/prompts";
import { downloadTemplate } from "giget";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { performBootstrap } from "../../src/core/project/bootstrap.js";
import { createMapiClient } from "../../src/lib/mapi/client.js";
import { createLogger } from "../../src/log.js";
import { type IapiRoute, iapiTestClient } from "../helpers/iapiTestClient.js";

vi.mock("@clack/prompts", () => ({
  spinner: () => ({
    start: () => {},
    stop: () => {},
    error: () => {},
    message: () => {},
  }),
  confirm: vi.fn(),
  select: vi.fn(),
  note: vi.fn(),
  intro: vi.fn(),
  outro: vi.fn(),
  isCancel: vi.fn(() => false),
}));

vi.mock("giget", () => ({
  downloadTemplate: vi.fn(),
}));

const ENV_ID = "11111111-2222-3333-4444-555555555555";

const TEMPLATE = [
  "# Kickstart sample env",
  "VITE_ENVIRONMENT_ID=",
  "VITE_DELIVERY_API_KEY=",
  "VITE_OTHER=keep-me",
  "",
].join("\n");

const projectInfoRoute: IapiRoute = {
  method: "GET",
  path: /\/project-management\//,
  reply: { projectName: "My Project", projectContainerId: "container-1", subscriptionId: "sub-1" },
};

const kickstartPropertiesRoute: IapiRoute = {
  method: "GET",
  path: /\/property$/,
  reply: [{ key: "SampleProjectType", value: "Kickstart" }],
};

const listKeysRoute = (reply: IapiRoute["reply"]): IapiRoute => ({
  method: "POST",
  path: /\/keys\/listing$/,
  reply,
});

// mapi is unused by the Kickstart sample (no preview space); a real client is fine since
// construction does no I/O and nothing here invokes it.
const mapiClient = createMapiClient({ token: "test-token", envId: ENV_ID });

let targetDir = "";

const makeParams = () => ({ envId: ENV_ID, path: targetDir }) as const;

const logger = createLogger("none");

const readEnvLocal = () => readFile(path.join(targetDir, ".env.local"), "utf8");

beforeEach(async () => {
  targetDir = await mkdtemp(path.join(tmpdir(), "bootstrap-test-"));
  vi.clearAllMocks();
  vi.mocked(isCancel).mockReturnValue(false);
  vi.mocked(downloadTemplate).mockImplementation(async (_repo, opts) => {
    await writeFile(path.join((opts as { dir: string }).dir, ".env.template"), TEMPLATE, "utf8");
    return {} as Awaited<ReturnType<typeof downloadTemplate>>;
  });
});

afterEach(async () => {
  await rm(targetDir, { recursive: true, force: true });
});

describe("performBootstrap", () => {
  it("wires .env.local using an existing delivery key the user selects", async () => {
    const iapiClient = iapiTestClient([
      projectInfoRoute,
      kickstartPropertiesRoute,
      listKeysRoute([{ token_seed_id: "seed-123", name: "My Key", expires_at: "2030-01-01" }]),
      { method: "GET", path: /\/keys\/[^/]+$/, reply: { api_key: "delivery-secret-abc" } },
    ]);
    vi.mocked(select).mockResolvedValue("seed-123");

    const result = await performBootstrap(makeParams(), { logger, iapiClient, mapiClient });

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") {
      return;
    }
    expect(result.value).toEqual({ subscriptionId: "sub-1", sampleProjectType: "Kickstart" });

    const env = await readEnvLocal();
    expect(env).toContain(`VITE_ENVIRONMENT_ID=${ENV_ID}`);
    expect(env).toContain("VITE_DELIVERY_API_KEY=delivery-secret-abc");
    expect(env).toContain("VITE_OTHER=keep-me");
  });

  it("creates a new delivery key when none exist and the user confirms", async () => {
    const iapiClient = iapiTestClient([
      projectInfoRoute,
      kickstartPropertiesRoute,
      listKeysRoute([]),
      { method: "POST", path: /\/keys$/, reply: { api_key: "new-secret-xyz", name: "new key" } },
    ]);
    vi.mocked(confirm).mockResolvedValue(true);

    const result = await performBootstrap(makeParams(), { logger, iapiClient, mapiClient });

    expect(result.kind).toBe("ok");
    const env = await readEnvLocal();
    expect(env).toContain("VITE_DELIVERY_API_KEY=new-secret-xyz");
  });

  it("aborts when the user cancels the create-key prompt", async () => {
    const iapiClient = iapiTestClient([
      projectInfoRoute,
      kickstartPropertiesRoute,
      listKeysRoute([]),
    ]);
    vi.mocked(confirm).mockResolvedValue(true);
    vi.mocked(isCancel).mockReturnValue(true);

    const result = await performBootstrap(makeParams(), { logger, iapiClient, mapiClient });

    expect(result.kind).toBe("err");
    if (result.kind !== "err") {
      return;
    }
    expect(result.error.kind).toBe("aborted");
    expect(downloadTemplate).not.toHaveBeenCalled();
  });

  it("rejects an environment whose SampleProjectType is unsupported", async () => {
    const iapiClient = iapiTestClient([
      projectInfoRoute,
      { method: "GET", path: /\/property$/, reply: [{ key: "SampleProjectType", value: "Nope" }] },
    ]);

    const result = await performBootstrap(makeParams(), { logger, iapiClient, mapiClient });

    expect(result.kind).toBe("err");
    if (result.kind !== "err") {
      return;
    }
    expect(result.error.kind).toBe("unsupported-sample");
    expect(downloadTemplate).not.toHaveBeenCalled();
  });

  it("fails fast when the target directory is not empty, before any API call", async () => {
    await writeFile(path.join(targetDir, "existing.txt"), "occupied", "utf8");
    // Empty route table: any iapi request would throw, proving none is made.
    const iapiClient = iapiTestClient([]);

    const result = await performBootstrap(makeParams(), { logger, iapiClient, mapiClient });

    expect(result.kind).toBe("err");
    if (result.kind !== "err") {
      return;
    }
    expect(result.error.kind).toBe("target-not-usable");
    expect(downloadTemplate).not.toHaveBeenCalled();
  });
});
