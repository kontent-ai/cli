import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { errorMessage } from "../error.js";
import { err, ok, type Result } from "../result.js";

export type CliConfig = Readonly<{
  telemetryEnabled?: boolean;
  telemetryNoticeShown?: boolean;
  userId?: string;
  deviceId?: string;
}>;

export const getCliConfigPath = (): string =>
  path.join(resolveConfigBaseDir(), "kontent", "cli", "config.json");

const resolveConfigBaseDir = (): string => {
  if (process.env.XDG_CONFIG_HOME) {
    return process.env.XDG_CONFIG_HOME;
  }
  if (process.platform === "win32" && process.env.APPDATA) {
    return process.env.APPDATA;
  }
  return path.join(os.homedir(), ".config");
};

export const readCliConfig = async (): Promise<CliConfig> => {
  try {
    const raw = await readFile(getCliConfigPath(), "utf8");
    return parseCliConfig(JSON.parse(raw));
  } catch {
    return {};
  }
};

const parseCliConfig = (parsed: unknown): CliConfig => {
  if (typeof parsed !== "object" || parsed === null) {
    return {};
  }
  const raw = parsed as Record<string, unknown>;
  return {
    ...(typeof raw.telemetryEnabled === "boolean"
      ? { telemetryEnabled: raw.telemetryEnabled }
      : {}),
    ...(typeof raw.telemetryNoticeShown === "boolean"
      ? { telemetryNoticeShown: raw.telemetryNoticeShown }
      : {}),
    ...(typeof raw.userId === "string" ? { userId: raw.userId } : {}),
    ...(typeof raw.deviceId === "string" ? { deviceId: raw.deviceId } : {}),
  };
};

export const writeCliConfig = async (patch: Partial<CliConfig>): Promise<Result<void, string>> => {
  const configPath = getCliConfigPath();
  try {
    await mkdir(path.dirname(configPath), { recursive: true });
    const current = await readCliConfig();
    const next = { ...current, ...patch };
    await writeFile(configPath, `${JSON.stringify(next, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    // writeFile applies `mode` only when it creates the file; if the file
    // already exists with looser permissions (created by hand, or by a tool
    // that did not set a mode), the write above would silently keep them.
    // The explicit chmod makes owner-only access hold after every write.
    await chmod(configPath, 0o600);
    return ok(undefined);
  } catch (cause) {
    return err(errorMessage(cause));
  }
};
