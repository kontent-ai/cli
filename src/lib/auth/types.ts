export type TokenSet = Readonly<{
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  expiresAt?: number;
  scope?: string;
  tokenType?: string;
}>;

export type AuthDecision =
  | { readonly type: "use-existing-token"; readonly accessToken: string }
  | { readonly type: "refresh-token"; readonly refreshToken: string }
  | { readonly type: "login" };

export type AuthError =
  | { readonly kind: "not-logged-in" }
  | { readonly kind: "access-denied" }
  | { readonly kind: "expired-token" }
  | { readonly kind: "slow-down" }
  | { readonly kind: "discovery-failed"; readonly cause: unknown }
  | { readonly kind: "device-auth-failed"; readonly cause: unknown }
  | { readonly kind: "poll-failed"; readonly code: string; readonly description?: string }
  | { readonly kind: "refresh-failed"; readonly cause: unknown }
  | { readonly kind: "storage-read-failed"; readonly cause: unknown }
  | { readonly kind: "storage-write-failed"; readonly cause: unknown }
  | { readonly kind: "storage-clear-failed"; readonly cause: unknown }
  | { readonly kind: "unknown"; readonly cause: unknown };
