import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cliConfigStore } from "../../src/cli/adapters/config/cliConfig.js";
import { ok } from "../../src/core/lib/result.js";
import { assertErr, assertOk } from "../helpers/assertResult.js";

describe("cli config store", () => {
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

  // A hand-edited value must never reach a request URL.
  it("reads back a stored environment id only when it is a GUID", async () => {
    await writeRawConfig(JSON.stringify({ envId: "../projects/other" }));

    const config = await cliConfigStore.read();

    assertOk(config);
    expect(config.value.envId).toBeUndefined();
  });

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
      name: "drops a telemetryNoticeShown that is not a boolean",
      stored: { telemetryNoticeShown: "yes" },
      expected: {},
    },
    { name: "drops a userId that is not a string", stored: { userId: 42 }, expected: {} },
    { name: "drops a deviceId that is not a string", stored: { deviceId: null }, expected: {} },
    { name: "drops an envId that is not a GUID", stored: { envId: "not-a-guid" }, expected: {} },
    {
      name: "drops an envId that is not a string",
      stored: { envId: 7, userId: "user" },
      expected: { userId: "user" },
    },
  ])("$name", async ({ stored, expected }) => {
    await writeRawConfig(JSON.stringify(stored));

    expect(await cliConfigStore.read()).toEqual(ok(expected));
  });

  it("keeps an own __proto__ key when it writes", async () => {
    await writeRawConfig('{"__proto__": {"telemetryEnabled": "x"}, "custom": 1}');

    assertOk(await cliConfigStore.read());
    assertOk(await cliConfigStore.write({ telemetryNoticeShown: true }));

    expect(await readFile(cliConfigStore.path(), "utf8")).toBe(
      '{\n  "__proto__": {\n    "telemetryEnabled": "x"\n  },\n  "custom": 1,\n  "telemetryNoticeShown": true\n}\n',
    );
  });

  it("reads a missing file as an empty config", async () => {
    expect(await cliConfigStore.read()).toEqual(ok({}));
  });

  it("reports a file that is not valid JSON", async () => {
    await writeRawConfig('{"telemetryEnabled": false,}');

    const config = await cliConfigStore.read();

    assertErr(config);
    expect(config.error).toEqual({
      message: `Config file at ${cliConfigStore.path()} is not valid JSON. Fix or delete it.`,
    });
  });

  it.each([
    "null",
    "[]",
    '"x"',
    "42",
  ])("reports %s, a top level that is not an object", async (text) => {
    await writeRawConfig(text);

    const config = await cliConfigStore.read();

    assertErr(config);
    expect(config.error.message).toBe(
      `Config file at ${cliConfigStore.path()} does not hold a JSON object. Fix or delete it.`,
    );
    assertErr(await cliConfigStore.write({ telemetryEnabled: true }));
    expect(await readFile(cliConfigStore.path(), "utf8")).toBe(text);
  });

  // Dropping it would read as "not opted out" and turn telemetry back on.
  it.each([
    '"false"',
    "0",
    "null",
  ])("reports a telemetryEnabled of %s instead of dropping it", async (value) => {
    const text = `{"telemetryEnabled": ${value}}`;
    await writeRawConfig(text);

    const config = await cliConfigStore.read();

    assertErr(config);
    expect(config.error.message).toBe(
      `Config file at ${cliConfigStore.path()} has a telemetryEnabled value that is not true or false. Fix or delete it.`,
    );
    assertErr(await cliConfigStore.write({ telemetryNoticeShown: true }));
    expect(await readFile(cliConfigStore.path(), "utf8")).toBe(text);
  });

  it("reports a config.json it cannot read and refuses to write", async () => {
    await mkdir(cliConfigStore.path(), { recursive: true });

    const config = await cliConfigStore.read();

    assertErr(config);
    expect(config.error.message).toContain(
      `Config file at ${cliConfigStore.path()} could not be read:`,
    );
    assertErr(await cliConfigStore.write({ telemetryEnabled: false }));
    expect(await readdir(cliConfigStore.path())).toEqual([]);
  });

  it("refuses to write over a file that is not valid JSON", async () => {
    const corrupt = '{"telemetryEnabled": false,}';
    await writeRawConfig(corrupt);

    const written = await cliConfigStore.write({ telemetryEnabled: true });

    assertErr(written);
    expect(await readFile(cliConfigStore.path(), "utf8")).toBe(corrupt);
  });

  it("merges a patch into the stored config without leaving a temp file behind", async () => {
    await writeRawConfig(JSON.stringify({ telemetryEnabled: false }));

    const written = await cliConfigStore.write({ telemetryNoticeShown: true });

    assertOk(written);
    expect(await cliConfigStore.read()).toEqual(
      ok({ telemetryEnabled: false, telemetryNoticeShown: true }),
    );
    expect(await readdir(join(configHome, "kontent", "cli"))).toEqual(["config.json"]);
  });

  // An older CLI must not delete settings a newer one added, nor hand edits.
  it("keeps keys it does not know, with their values, when it writes", async () => {
    const unknownFields = {
      targets: { "https://app.kontent.ai": { envId: "x" } },
      list: [1, "two", { three: null }],
      nothing: null,
      flag: "on",
    };
    await writeRawConfig(JSON.stringify({ ...unknownFields, telemetryEnabled: false }));

    const written = await cliConfigStore.write({ telemetryNoticeShown: true });

    assertOk(written);
    expect(JSON.parse(await readFile(cliConfigStore.path(), "utf8"))).toEqual({
      ...unknownFields,
      telemetryEnabled: false,
      telemetryNoticeShown: true,
    });
    expect(await cliConfigStore.read()).toEqual(
      ok({ telemetryEnabled: false, telemetryNoticeShown: true }),
    );
  });

  // Validation applies to reads only; a value this version rejects may be valid for another one.
  it("keeps known keys whose values it rejects on read, in their order, with patch keys last", async () => {
    await writeRawConfig(
      JSON.stringify({
        zeta: 1,
        envId: "not-a-guid",
        userId: 42,
        deviceId: null,
        telemetryNoticeShown: "yes",
        alpha: [1],
      }),
    );

    const written = await cliConfigStore.write({ telemetryEnabled: false });

    assertOk(written);
    const stored = JSON.parse(await readFile(cliConfigStore.path(), "utf8"));
    expect(Object.keys(stored)).toEqual([
      "zeta",
      "envId",
      "userId",
      "deviceId",
      "telemetryNoticeShown",
      "alpha",
      "telemetryEnabled",
    ]);
    expect(stored).toEqual({
      zeta: 1,
      envId: "not-a-guid",
      userId: 42,
      deviceId: null,
      telemetryNoticeShown: "yes",
      alpha: [1],
      telemetryEnabled: false,
    });
    expect(await cliConfigStore.read()).toEqual(ok({ telemetryEnabled: false }));
  });

  it("removes the fields logout clears even when their values are rejected on read", async () => {
    await writeRawConfig(JSON.stringify({ envId: "not-a-guid", userId: 42, custom: 1 }));

    const written = await cliConfigStore.write({ userId: undefined, envId: undefined });

    assertOk(written);
    expect(JSON.parse(await readFile(cliConfigStore.path(), "utf8"))).toEqual({ custom: 1 });
  });

  it("removes the fields logout clears and keeps the rest", async () => {
    await writeRawConfig(
      JSON.stringify({
        telemetryEnabled: false,
        deviceId: "device",
        userId: "user",
        envId: "6f0b4d5e-1c2a-4b3d-9e8f-7a6b5c4d3e2f",
        custom: { kept: true },
      }),
    );

    const written = await cliConfigStore.write({ userId: undefined, envId: undefined });

    assertOk(written);
    expect(JSON.parse(await readFile(cliConfigStore.path(), "utf8"))).toEqual({
      telemetryEnabled: false,
      deviceId: "device",
      custom: { kept: true },
    });
  });

  it("still refuses a config with unknown keys and a telemetryEnabled that is not a boolean", async () => {
    const text = '{"custom": {"kept": true}, "telemetryEnabled": "false"}';
    await writeRawConfig(text);

    assertErr(await cliConfigStore.read());
    assertErr(await cliConfigStore.write({ telemetryNoticeShown: true }));
    expect(await readFile(cliConfigStore.path(), "utf8")).toBe(text);
  });
});
