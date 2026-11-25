import { describe, expect, it, vi } from "vitest";
import type { CliConfig, ConfigReadError } from "../../src/cli/adapters/config/cliConfig.js";
import { resolveEnvId } from "../../src/cli/commands/shared/resolveEnvId.js";
import type { Logger } from "../../src/cli/log.js";
import { err, ok, type Result } from "../../src/core/lib/result.js";

const FLAG_ENV_ID = "11111111-2222-3333-4444-555555555555";
const STORED_ENV_ID = "99999999-8888-7777-6666-555555555555";
const BROKEN: ConfigReadError = {
  message: "Config file at /x/config.json is not valid JSON. Fix or delete it.",
};

const fakeEffects = (config: Result<CliConfig, ConfigReadError>) => {
  const infos: string[] = [];
  const logger: Logger = {
    info: (_level, ...messages) => infos.push(messages.join(" ")),
    warning: () => {},
    error: () => {},
    isVerbose: false,
  };
  return { effects: { logger, config: { read: vi.fn(() => Promise.resolve(config)) } }, infos };
};

describe("resolveEnvId", () => {
  it.each([
    {
      name: "takes the flag without reading the config",
      config: ok({ envId: STORED_ENV_ID }),
      flag: FLAG_ENV_ID,
      expected: ok({ envId: FLAG_ENV_ID, source: "flag" }),
      isConfigRead: false,
      infos: [],
    },
    {
      name: "takes the flag even when the config is unreadable",
      config: err(BROKEN),
      flag: FLAG_ENV_ID,
      expected: ok({ envId: FLAG_ENV_ID, source: "flag" }),
      isConfigRead: false,
      infos: [],
    },
    {
      name: "falls back to the stored id and announces it",
      config: ok({ envId: STORED_ENV_ID }),
      flag: undefined,
      expected: ok({ envId: STORED_ENV_ID, source: "stored" }),
      isConfigRead: true,
      infos: [`Using the stored default environment ${STORED_ENV_ID}.`],
    },
    {
      name: "reports a missing id when none is stored",
      config: ok({}),
      flag: undefined,
      expected: err({ kind: "missing-env-id" }),
      isConfigRead: true,
      infos: [],
    },
    {
      name: "reports an unreadable config instead of a missing id",
      config: err(BROKEN),
      flag: undefined,
      expected: err({ kind: "config-unreadable", message: BROKEN.message }),
      isConfigRead: true,
      infos: [],
    },
  ] as const)("$name", async ({ config, flag, expected, isConfigRead, infos: expectedInfos }) => {
    const { effects, infos } = fakeEffects(config);

    expect(await resolveEnvId(effects, flag)).toEqual(expected);
    expect(effects.config.read).toHaveBeenCalledTimes(isConfigRead ? 1 : 0);
    expect(infos).toEqual(expectedInfos);
  });
});
