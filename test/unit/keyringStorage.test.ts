import { beforeEach, describe, expect, it, vi } from "vitest";
import { createKeyringStorage } from "../../src/cli/adapters/auth/storage.js";
import type { AuthError, TokenSet } from "../../src/core/auth/types.js";
import type { Result } from "../../src/core/lib/result.js";
import { assertErr } from "../helpers/assertResult.js";

// The native keyring has no seam, so the module is replaced: `loadError` fails the
// import the way @napi-rs/keyring's loader does, `entryError` fails every entry call.
const keyring = vi.hoisted(() => ({
  loadError: undefined as Error | undefined,
  entryError: new Error("unset"),
}));

vi.mock("@napi-rs/keyring", () => ({
  get AsyncEntry() {
    if (keyring.loadError !== undefined) {
      throw keyring.loadError;
    }
    return function AsyncEntry() {
      const fail = async () => Promise.reject(keyring.entryError);
      return { getPassword: fail, setPassword: fail, deleteCredential: fail };
    };
  },
}));

beforeEach(() => {
  keyring.loadError = undefined;
});

const TOKENS: TokenSet = { accessToken: "access-token" };

const operations: ReadonlyArray<readonly [string, () => Promise<Result<unknown, AuthError>>]> = [
  ["read", async () => createKeyringStorage().read()],
  ["write", async () => createKeyringStorage().write(TOKENS)],
  ["clear", async () => createKeyringStorage().clear()],
];

// Verbatim from @napi-rs/keyring 1.3.0's index.js.
const loaderErrors = [
  new Error(
    "Cannot find native binding. npm has a bug related to optional dependencies (https://github.com/npm/cli/issues/4828). Please try `npm i` again after removing both package-lock.json and node_modules directory.",
  ),
  new Error("Failed to load native binding"),
];

// As keyring-core words NoStorageAccess and NoDefaultStore.
const storeErrors = [
  new Error("Couldn't access platform storage: collection is locked"),
  new Error("No default store has been set, so cannot search or create entries"),
];

describe("createKeyringStorage", () => {
  describe.each(operations)("%s", (_operation, run) => {
    it.each(loaderErrors)("reports a missing native module for %s", async (loadError) => {
      keyring.loadError = loadError;

      const result = await run();

      assertErr(result);
      expect(result.error).toMatchObject({
        cause: loadError,
        unavailable: "native-module-missing",
      });
    });

    it.each(storeErrors)("reports an inaccessible store for %s", async (entryError) => {
      keyring.entryError = entryError;

      const result = await run();

      assertErr(result);
      expect(result.error).toMatchObject({ cause: entryError, unavailable: "store-inaccessible" });
    });

    it("leaves any other failure unclassified", async () => {
      keyring.entryError = new Error("Platform failure: errSecDuplicateItem");

      const result = await run();

      assertErr(result);
      expect(result.error).not.toHaveProperty("unavailable");
    });
  });
});
