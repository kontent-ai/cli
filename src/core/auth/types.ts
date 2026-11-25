export type TokenSet = Readonly<{
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  // Small account label derived from the id token at login time. We persist
  // this instead of the raw id token, whose size overflows Windows' credential
  // limit: 2560 bytes of secret, which @napi-rs/keyring stores as UTF-16, so
  // about 1280 characters (the entry name does not count).
  identifier?: string;
}>;

export type AuthDecision =
  | { readonly type: "use-existing-token"; readonly tokens: TokenSet }
  | { readonly type: "refresh-token"; readonly refreshToken: string }
  | { readonly type: "login" };

export type AuthError =
  | { readonly kind: "not-logged-in" }
  | { readonly kind: "access-denied" }
  | { readonly kind: "expired-token" }
  | { readonly kind: "discovery-failed"; readonly cause: unknown }
  | { readonly kind: "device-auth-failed"; readonly cause: unknown }
  | { readonly kind: "poll-failed"; readonly code: string; readonly description?: string }
  | { readonly kind: "refresh-failed"; readonly cause: unknown }
  // Auth0 answered invalid_grant: the refresh token is expired, revoked, or
  // already rotated. Unlike refresh-failed, this is not retryable.
  | { readonly kind: "refresh-rejected"; readonly cause: unknown }
  // A rejected refresh token after which the stored tokens were cleared. Unlike
  // not-logged-in, the user did log in on this machine.
  | { readonly kind: "session-expired"; readonly refreshError: AuthError }
  | StorageError<"storage-read-failed">
  | StorageError<"storage-write-failed">
  | StorageError<"storage-clear-failed">
  | { readonly kind: "unknown"; readonly cause: unknown };

/**
 * Why no keyring could be used at all, as opposed to a failure of a working one:
 * the native module did not load, or the platform store is missing or locked.
 */
export type KeyringUnavailability = "native-module-missing" | "store-inaccessible";

type StorageError<TKind extends string> = Readonly<{
  kind: TKind;
  cause: unknown;
  unavailable?: KeyringUnavailability;
}>;
