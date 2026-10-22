import { match } from "ts-pattern";
import type { AuthError } from "../auth/types.js";
import type { Result } from "../lib/result.js";

export type VerificationDecision =
  | { readonly kind: "verify"; readonly accessToken: string }
  | { readonly kind: "skip-verification" }
  | { readonly kind: "fail"; readonly error: AuthError };

// Logged out is not an error: the id is stored unchecked. Any other auth failure stops.
export const decideVerification = (accessToken: Result<string, AuthError>): VerificationDecision =>
  match(accessToken)
    .with(
      { kind: "ok" },
      ({ value }): VerificationDecision => ({ kind: "verify", accessToken: value }),
    )
    .with(
      { kind: "err", error: { kind: "not-logged-in" } },
      (): VerificationDecision => ({ kind: "skip-verification" }),
    )
    .with({ kind: "err" }, ({ error }): VerificationDecision => ({ kind: "fail", error }))
    .exhaustive();
