import type { Result } from "../../src/lib/result.js";

export function assertOk<T, E>(
  result: Result<T, E>,
): asserts result is { readonly kind: "ok"; readonly value: T } {
  if (result.kind !== "ok") {
    throw new Error(`Expected an ok result, got err: ${JSON.stringify(result.error)}`);
  }
}

export function assertErr<T, E>(
  result: Result<T, E>,
): asserts result is { readonly kind: "err"; readonly error: E } {
  if (result.kind !== "err") {
    throw new Error(`Expected an err result, got ok: ${JSON.stringify(result.value)}`);
  }
}
