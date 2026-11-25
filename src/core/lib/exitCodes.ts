export const EXIT_CODES = {
  success: 0,
  failure: 1,
  usage: 2,
  "auth-required": 4,
  cancelled: 130,
} as const satisfies Record<string, number>;

// A usage error is caught by the argument parser before any command runs, so no outcome carries it.
export type ErrorReason = Exclude<keyof typeof EXIT_CODES, "success" | "usage">;
