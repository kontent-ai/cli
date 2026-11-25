import { isLoginRequired } from "../../../core/auth/session.js";
import type { AuthError } from "../../../core/auth/types.js";
import type { EventProperties } from "../../../core/telemetry/events.js";
import type { ErrorReason } from "./exitCodes.js";

export type CommandOutcome =
  | Readonly<{ status: "success"; properties?: EventProperties }>
  | Readonly<{
      status: "error";
      reason: ErrorReason;
      errorCode: string;
      properties?: EventProperties;
    }>;

export const failureOutcome = (
  errorCode: string,
  properties?: EventProperties,
): CommandOutcome => ({
  status: "error",
  reason: "failure",
  errorCode,
  ...(properties === undefined ? {} : { properties }),
});

export const authFailure = (error: AuthError, properties?: EventProperties): CommandOutcome => ({
  status: "error",
  reason: isLoginRequired(error) ? "auth-required" : "failure",
  errorCode: `auth:${error.kind}`,
  ...(properties === undefined ? {} : { properties }),
});
