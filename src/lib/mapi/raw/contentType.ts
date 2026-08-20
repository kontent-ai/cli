/**
 * Mirrors core-sdk's `isApplicationJsonResponseType`, the rule its default
 * adapter parses a response body by. core-sdk does not export it, so the rule is
 * duplicated rather than imported - `test/unit/jsonContentType.test.ts` drives
 * the real adapter to assert the two still agree.
 */
export const isJsonContentType = (rawContentType: string | undefined): boolean =>
  rawContentType?.toLowerCase().includes("application/json") ?? false;
