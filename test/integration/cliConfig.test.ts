import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createCliConfigStore } from "../../src/cli/adapters/config/cliConfig.js";
import { ok } from "../../src/core/lib/result.js";
import { assertErr, assertOk } from "../helpers/assertResult.js";

describe("cli config store", () => {
  const store = createCliConfigStore("cli");
  let configHome: string;

  beforeAll(async () => {
    configHome = await mkdtemp(join(tmpdir(), "kontent-config-"));
    vi.stubEnv("XDG_CONFIG_HOME", configHome);
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    await rm(configHome, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await rm(join(configHome, "kontent"), { recursive: true, force: true });
  });

  const writeRawConfig = async (text: string): Promise<void> => {
    const dir = join(configHome, "kontent", "cli");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "config.json"), text);
  };

  const guid = "6f0b4d5e-1c2a-4b3d-9e8f-7a6b5c4d3e2f";

  it.each([
    {
      name: "keeps every valid field",
      stored: {
        telemetryEnabled: false,
        telemetryNoticeShown: true,
        userId: "user",
        deviceId: "device",
        envId: guid,
      },
      expected: {
        telemetryEnabled: false,
        telemetryNoticeShown: true,
        userId: "user",
        deviceId: "device",
        envId: guid,
      },
    },
    {
      name: "leaves out unknown keys",
      stored: { custom: 1, telemetryEnabled: true },
      expected: { telemetryEnabled: true },
    },
    {
      name: "drops every field whose value is not valid and keeps the rest",
      stored: {
        telemetryEnabled: true,
        telemetryNoticeShown: "yes",
        userId: 42,
        deviceId: null,
        // A hand-edited value must never reach a request URL.
        envId: "../projects/other",
      },
      expected: { telemetryEnabled: true },
    },
  ])("$name", async ({ stored, expected }) => {
    await writeRawConfig(JSON.stringify(stored));

    expect(await store.read()).toEqual(ok(expected));
  });

  it("keeps an own __proto__ key when it writes", async () => {
    await writeRawConfig('{"__proto__": {"telemetryEnabled": "x"}, "custom": 1}');

    assertOk(await store.read());
    assertOk(await store.write({ telemetryNoticeShown: true }));

    expect(await readFile(store.path(), "utf8")).toBe(
      '{\n  "__proto__": {\n    "telemetryEnabled": "x"\n  },\n  "custom": 1,\n  "telemetryNoticeShown": true\n}\n',
    );
  });

  it("reads a missing file as an empty config", async () => {
    expect(await store.read()).toEqual(ok({}));
  });

  it("reports a file that is not valid JSON and refuses to write over it", async () => {
    const corrupt = '{"telemetryEnabled": false,}';
    await writeRawConfig(corrupt);

    const config = await store.read();

    assertErr(config);
    expect(config.error).toEqual({
      message: `Config file at ${store.path()} is not valid JSON. Fix or delete it.`,
    });
    assertErr(await store.write({ telemetryEnabled: true }));
    expect(await readFile(store.path(), "utf8")).toBe(corrupt);
  });

  it.each([
    "null",
    "[]",
    '"x"',
    "42",
  ])("reports %s, a top level that is not an object", async (text) => {
    await writeRawConfig(text);

    const config = await store.read();

    assertErr(config);
    expect(config.error.message).toBe(
      `Config file at ${store.path()} does not hold a JSON object. Fix or delete it.`,
    );
    assertErr(await store.write({ telemetryEnabled: true }));
    expect(await readFile(store.path(), "utf8")).toBe(text);
  });

  // Dropping it would read as "not opted out" and turn telemetry back on.
  it.each([
    '"false"',
    "0",
    "null",
  ])("reports a telemetryEnabled of %s instead of dropping it", async (value) => {
    const text = `{"telemetryEnabled": ${value}}`;
    await writeRawConfig(text);

    const config = await store.read();

    assertErr(config);
    expect(config.error.message).toBe(
      `Config file at ${store.path()} has a telemetryEnabled value that is not true or false. Fix or delete it.`,
    );
    assertErr(await store.write({ telemetryNoticeShown: true }));
    expect(await readFile(store.path(), "utf8")).toBe(text);
  });

  it("reports a config.json it cannot read and refuses to write", async () => {
    await mkdir(store.path(), { recursive: true });

    const config = await store.read();

    assertErr(config);
    expect(config.error.message).toContain(`Config file at ${store.path()} could not be read:`);
    assertErr(await store.write({ telemetryEnabled: false }));
    expect(await readdir(store.path())).toEqual([]);
  });

  // An older CLI must not delete settings a newer one added, nor hand edits. Validation applies
  // to reads only, so a value this version rejects may be valid for another one.
  it("keeps keys it does not know or whose values it rejects, when it writes", async () => {
    const keptFields = {
      targets: { "https://app.kontent.ai": { envId: "x" } },
      list: [1, "two", { three: null }],
      nothing: null,
      flag: "on",
      envId: "not-a-guid",
    };
    await writeRawConfig(JSON.stringify({ ...keptFields, telemetryEnabled: false }));

    const written = await store.write({ telemetryNoticeShown: true });

    assertOk(written);
    expect(JSON.parse(await readFile(store.path(), "utf8"))).toEqual({
      ...keptFields,
      telemetryEnabled: false,
      telemetryNoticeShown: true,
    });
    expect(await store.read()).toEqual(ok({ telemetryEnabled: false, telemetryNoticeShown: true }));
  });

  it("removes the fields logout clears, valid or not, and keeps the rest", async () => {
    await writeRawConfig(
      JSON.stringify({
        telemetryEnabled: false,
        deviceId: "device",
        userId: 42,
        envId: guid,
        custom: { kept: true },
      }),
    );

    const written = await store.write({ userId: undefined, envId: undefined });

    assertOk(written);
    expect(JSON.parse(await readFile(store.path(), "utf8"))).toEqual({
      telemetryEnabled: false,
      deviceId: "device",
      custom: { kept: true },
    });
  });
});
