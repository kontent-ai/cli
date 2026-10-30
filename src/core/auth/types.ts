export type TokenSet = Readonly<{
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  // Small account label derived from the id token at login time. We persist
  // this instead of the raw id token, whose size overflows Windows' credential
  // blob limit (2560 chars).
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
  | { readonly kind: "storage-read-failed"; readonly cause: unknown }
  | { readonly kind: "storage-write-failed"; readonly cause: unknown }
  | { readonly kind: "storage-clear-failed"; readonly cause: unknown }
  | { readonly kind: "unknown"; readonly cause: unknown };
