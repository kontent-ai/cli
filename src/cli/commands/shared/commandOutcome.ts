import { isLoginRequired } from "../../../core/auth/session.js";
import type { AuthError } from "../../../core/auth/types.js";
import type { ErrorReason } from "../../../core/lib/exitCodes.js";
import type { EventProperties } from "../../../core/telemetry/events.js";

export type CommandOutcome =
  | Readonly<{ status: "success"; properties?: EventProperties }>
  | Readonly<{
      status: "error";
      reason: ErrorReason;
      errorCode: string;
      properties?: EventProperties;
    }>;

export const createFailureOutcome = (
  errorCode: string,
  properties?: EventProperties,
): CommandOutcome => ({
  status: "error",
  reason: "failure",
  errorCode,
  ...(properties === undefined ? {} : { properties }),
});

export const createLoginAwareFailureOutcome = (
  params: Readonly<{ isLoginRequired: boolean; errorCode: string; properties?: EventProperties }>,
): CommandOutcome => ({
  status: "error",
  reason: params.isLoginRequired ? "auth-required" : "failure",
  errorCode: params.errorCode,
  ...(params.properties === undefined ? {} : { properties: params.properties }),
});

export const createAuthFailureOutcome = (
  error: AuthError,
  properties?: EventProperties,
): CommandOutcome =>
  createLoginAwareFailureOutcome({
    isLoginRequired: isLoginRequired(error),
    errorCode: `auth:${error.kind}`,
    ...(properties === undefined ? {} : { properties }),
  });
