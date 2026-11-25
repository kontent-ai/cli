import type { AsyncEntry } from "@napi-rs/keyring";
import type { LoginContext } from "../../../core/auth/loginContext.js";
import type { AuthError, KeyringUnavailability, TokenSet } from "../../../core/auth/types.js";
import { targetKey } from "../../../core/kontentUrl/kontentUrl.js";
import { errorMessage } from "../../../core/lib/error.js";
import { err, isErr, ok, type Result } from "../../../core/lib/result.js";
import type { Logger } from "../../log.js";

export type TokenStorage = Readonly<{
  read: () => Promise<Result<TokenSet | null, AuthError>>;
  write: (tokens: TokenSet) => Promise<Result<void, AuthError>>;
  clear: () => Promise<Result<void, AuthError>>;
}>;

// The single entry every login shared before entries were split per login context.
export type LegacyEntry = Readonly<{
  remove: () => Promise<void>;
}>;

export const createKeyringStorage = (context: LoginContext): TokenStorage => {
  const account = accountFor(context);

  return {
    read: async () => {
      try {
        const raw = await (await loadEntry(account)).getPassword();
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
        await (await loadEntry(account)).setPassword(JSON.stringify(tokens));
        return ok(undefined);
      } catch (cause) {
        return err({ kind: "storage-write-failed", cause, ...keyringUnavailability(cause) });
      }
    },

    clear: async () => clearEntry(account),
  };
};

const LEGACY_ACCOUNT = "default";

// Best effort: the entry only holds a login no current version reads, so a failure never
// changes the command's result.
export const createLegacyTokens = (logger: Logger): LegacyEntry => ({
  remove: async () => {
    const cleared = await clearEntry(LEGACY_ACCOUNT);
    if (isErr(cleared)) {
      logger.warning(
        "verbose",
        `Could not remove the old keyring entry: ${errorMessage(cleared.error.cause)}`,
      );
    }
  },
});

// A JSON array keeps the parts apart whatever characters they contain.
export const accountFor = (context: LoginContext): string =>
  JSON.stringify([
    context.auth0Domain,
    context.clientId,
    context.audience,
    targetKey(context.target),
  ]);

const SERVICE = "ai.kontent.cli";

// The native binding loads on first use, not at import, so a missing or broken one fails
// only the operation that needs the keyring, as that operation's storage error, instead
// of the whole CLI.
const loadEntry = async (account: string): Promise<AsyncEntry> => {
  const { AsyncEntry } = await import("@napi-rs/keyring");
  return new AsyncEntry(SERVICE, account);
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

const clearEntry = async (
  account: string,
): Promise<Result<void, Extract<AuthError, { kind: "storage-clear-failed" }>>> => {
  try {
    const entry = await loadEntry(account);
    const existing = await entry.getPassword();
    if (existing === undefined) {
      return ok(undefined);
    }
    await entry.deleteCredential();
    return ok(undefined);
  } catch (cause) {
    return err({ kind: "storage-clear-failed", cause, ...keyringUnavailability(cause) });
  }
};
