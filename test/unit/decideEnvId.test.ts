import { describe, expect, it } from "vitest";
import { decideEnvId } from "../../src/core/environment/envId.js";
import { none, some } from "../../src/core/lib/option.js";

const FLAG_ENV_ID = "11111111-1111-1111-1111-111111111111";
const STORED_ENV_ID = "22222222-2222-2222-2222-222222222222";

describe("decideEnvId", () => {
  it.each([
    {
      case: "the flag wins over the stored id",
      envIdFromFlag: FLAG_ENV_ID,
      storedEnvId: STORED_ENV_ID,
      expected: some({ envId: FLAG_ENV_ID, source: "flag" }),
    },
    {
      case: "the stored id fills in for a missing flag",
      envIdFromFlag: undefined,
      storedEnvId: STORED_ENV_ID,
      expected: some({ envId: STORED_ENV_ID, source: "stored" }),
    },
    {
      case: "nothing without either",
      envIdFromFlag: undefined,
      storedEnvId: undefined,
      expected: none,
    },
  ])("$case", ({ envIdFromFlag, storedEnvId, expected }) => {
    expect(decideEnvId({ envIdFromFlag, storedEnvId })).toEqual(expected);
  });
});
