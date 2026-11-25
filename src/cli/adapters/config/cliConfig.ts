import os from "node:os";
import path from "node:path";
import { z } from "zod/mini";

import { isGuid } from "../../../core/lib/guid.js";
import { isNone } from "../../../core/lib/option.js";
import {
  err,
  flatMap,
  fromThrowable,
  isErr,
  map,
  ok,
  type Result,
} from "../../../core/lib/result.js";
import { files } from "../files/files.js";

export type CliConfig = Readonly<z.infer<typeof cliConfigSchema>>;

/** The config file exists but cannot be used; a missing file is an empty config instead. */
export type ConfigReadError = Readonly<{
  message: string;
}>;

export type CliConfigStore = Readonly<{
  path: () => string;
  read: () => Promise<Result<CliConfig, ConfigReadError>>;
  // Refuses to write over a file it cannot read, so a corrupt config is never silently replaced.
  write: (patch: Partial<CliConfig>) => Promise<Result<void, string>>;
}>;

export const createCliConfigStore = (folder: string): CliConfigStore => {
  const store: CliConfigStore = {
    path: () => path.join(resolveConfigBaseDir(), "kontent", folder, "config.json"),

    read: async () => map(await readStoredConfig(store.path()), ({ config }) => config),

    write: async (patch) => {
      const current = await readStoredConfig(store.path());
      if (isErr(current)) {
        return err(current.error.message);
      }
      // Every stored key is kept as it is, including ones this version does not know or
      // rejects on read, so a newer CLI's settings and hand edits survive.
      const next = { ...current.value.raw, ...patch };
      return files.writeTextAtomic(store.path(), `${JSON.stringify(next, null, 2)}\n`);
    },
  };
  return store;
};

const resolveConfigBaseDir = (): string => {
  if (process.env.XDG_CONFIG_HOME) {
    return process.env.XDG_CONFIG_HOME;
  }
  if (process.platform === "win32" && process.env.APPDATA) {
    return process.env.APPDATA;
  }
  return path.join(os.homedir(), ".config");
};

type StoredConfig = Readonly<{
  config: CliConfig;
  raw: Readonly<Record<string, unknown>>;
}>;

const readStoredConfig = async (
  configPath: string,
): Promise<Result<StoredConfig, ConfigReadError>> => {
  const raw = await files.readText(configPath);
  if (isErr(raw)) {
    return err({ message: `Config file at ${configPath} could not be read: ${raw.error}` });
  }
  if (isNone(raw.value)) {
    return ok({ config: {}, raw: {} });
  }
  const text = raw.value.value;
  const parsed = fromThrowable(
    (): unknown => JSON.parse(text),
    () => configFileError(configPath, "is not valid JSON"),
  );
  return flatMap(parsed, (value) => parseStoredConfig(value, configPath));
};

const configFileError = (configPath: string, problem: string): ConfigReadError => ({
  message: `Config file at ${configPath} ${problem}. Fix or delete it.`,
});

const dropInvalid = <T extends z.core.SomeType>(schema: T) =>
  z.catch(z.optional(schema), undefined);

const cliConfigSchema = z.object({
  // Dropping a malformed opt-out would silently turn telemetry back on.
  telemetryEnabled: z.optional(z.boolean()),
  telemetryNoticeShown: dropInvalid(z.boolean()),
  userId: dropInvalid(z.string()),
  deviceId: dropInvalid(z.string()),
  // Only a GUID reads back, so a hand-edited value never reaches a request URL.
  envId: dropInvalid(z.string().check(z.refine(isGuid))),
});

// Checked rather than parsed: zod copies objects and drops an own `__proto__` key, which the
// write must keep like any other key.
const jsonObjectSchema = z.custom<Readonly<Record<string, unknown>>>(
  (value) => typeof value === "object" && value !== null && !Array.isArray(value),
);

const parseStoredConfig = (
  parsed: unknown,
  configPath: string,
): Result<StoredConfig, ConfigReadError> => {
  const raw = jsonObjectSchema.safeParse(parsed);
  if (!raw.success) {
    return err(configFileError(configPath, "does not hold a JSON object"));
  }
  // Every other field drops an invalid value, so only telemetryEnabled can fail here.
  const config = cliConfigSchema.safeParse(raw.data);
  if (!config.success) {
    return err(
      configFileError(configPath, "has a telemetryEnabled value that is not true or false"),
    );
  }
  return ok({ config: config.data, raw: raw.data });
};
