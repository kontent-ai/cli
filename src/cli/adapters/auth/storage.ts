import type { AsyncEntry } from "@napi-rs/keyring";
import type { AuthError, KeyringUnavailability, TokenSet } from "../../../core/auth/types.js";
import { err, ok, type Result } from "../../../core/lib/result.js";

export type TokenStorage = Readonly<{
  read: () => Promise<Result<TokenSet | null, AuthError>>;
  write: (tokens: TokenSet) => Promise<Result<void, AuthError>>;
  clear: () => Promise<Result<void, AuthError>>;
}>;

export const createKeyringStorage = (): TokenStorage => ({
  read: async () => {
    try {
      const raw = await (await loadEntry()).getPassword();
      if (raw === undefined) {
        return ok(null);
      }
      return ok(parseStoredTokens(raw));
    } catch (cause) {
      return err({ kind: "storage-read-failed", cause, ...keyringUnavailability(cause) });
    }
  },

  write: async (tokens) => {
    try {
      await (await loadEntry()).setPassword(JSON.stringify(tokens));
      return ok(undefined);
    } catch (cause) {
      return err({ kind: "storage-write-failed", cause, ...keyringUnavailability(cause) });
    }
  },

  clear: async () => {
    try {
      const entry = await loadEntry();
      const existing = await entry.getPassword();
      if (existing === undefined) {
        return ok(undefined);
      }
      await entry.deleteCredential();
      return ok(undefined);
    } catch (cause) {
      return err({ kind: "storage-clear-failed", cause, ...keyringUnavailability(cause) });
    }
  },
});

const SERVICE = "ai.kontent.cli";
const ACCOUNT = "default";

// The native binding loads on first use, not at import, so a missing or broken one fails
// only the operation that needs the keyring, as that operation's storage error, instead
// of the whole CLI. Telemetry's identity still reads it after every command it tracks.
const loadEntry = async (): Promise<AsyncEntry> => {
  const { AsyncEntry } = await import("@napi-rs/keyring");
  return new AsyncEntry(SERVICE, ACCOUNT);
};

const parseStoredTokens = (raw: string): TokenSet | null => {
  const parsed = safeJsonParse(raw);
  return isTokenSetShape(parsed) ? parsed : null;
};

const safeJsonParse = (raw: string): unknown => {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const isTokenSetShape = (value: unknown): value is TokenSet =>
  typeof value === "object" &&
  value !== null &&
  "accessToken" in value &&
  typeof value.accessToken === "string";

// @napi-rs/keyring's loader and keyring-core (NoStorageAccess, NoDefaultStore) report
// these only as messages, so the message is the one signal to match on.
const UNAVAILABLE_KEYRING_MESSAGES: ReadonlyArray<
  Readonly<{ message: string; reason: KeyringUnavailability }>
> = [
  { message: "Cannot find native binding", reason: "native-module-missing" },
  { message: "Failed to load native binding", reason: "native-module-missing" },
  { message: "Couldn't access platform storage", reason: "store-inaccessible" },
  { message: "No default store has been set", reason: "store-inaccessible" },
];

const keyringUnavailability = (
  cause: unknown,
): Readonly<{ unavailable?: KeyringUnavailability }> => {
  const known =
    cause instanceof Error
      ? UNAVAILABLE_KEYRING_MESSAGES.find(({ message }) => cause.message.includes(message))
      : undefined;
  return known === undefined ? {} : { unavailable: known.reason };
};
