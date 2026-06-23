import { AsyncEntry } from "@napi-rs/keyring";

import { err, ok, type Result } from "../result.js";
import type { AuthError, TokenSet } from "./types.js";

const SERVICE = "kontent-cli";
const ACCOUNT = "default";

export type TokenStorage = Readonly<{
  read: () => Promise<Result<TokenSet | null, AuthError>>;
  write: (tokens: TokenSet) => Promise<Result<void, AuthError>>;
  clear: () => Promise<Result<void, AuthError>>;
}>;

export const createKeyringStorage = (): TokenStorage => {
  const entry = new AsyncEntry(SERVICE, ACCOUNT);

  return {
    read: async () => {
      try {
        const raw = await entry.getPassword();
        if (raw === undefined) {
          return ok(null);
        }
        return ok(parseStoredTokens(raw));
      } catch (cause) {
        return err({ kind: "storage-read-failed", cause });
      }
    },

    write: async (tokens) => {
      try {
        await entry.setPassword(JSON.stringify(tokens));
        return ok(undefined);
      } catch (cause) {
        return err({ kind: "storage-write-failed", cause });
      }
    },

    clear: async () => {
      try {
        const existing = await entry.getPassword();
        if (existing === undefined) {
          return ok(undefined);
        }
        await entry.deleteCredential();
        return ok(undefined);
      } catch (cause) {
        return err({ kind: "storage-clear-failed", cause });
      }
    },
  };
};

const safeJsonParse = (raw: string): unknown => {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const parseStoredTokens = (raw: string): TokenSet | null => {
  const parsed = safeJsonParse(raw);
  return isTokenSetShape(parsed) ? parsed : null;
};

const isTokenSetShape = (value: unknown): value is TokenSet =>
  typeof value === "object" &&
  value !== null &&
  "accessToken" in value &&
  typeof value.accessToken === "string";
