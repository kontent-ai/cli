export const EXIT_CODES = {
  success: 0,
  failure: 1,
  cancelled: 2,
  "auth-required": 4,
} as const satisfies Record<string, number>;

export type ErrorReason = Exclude<keyof typeof EXIT_CODES, "success">;
