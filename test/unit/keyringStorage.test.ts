import { beforeEach, describe, expect, it, vi } from "vitest";
import { createKeyringStorage, createLegacyTokens } from "../../src/cli/adapters/auth/storage.js";
import type { Logger } from "../../src/cli/log.js";
import { loginContextFor } from "../../src/core/auth/loginContext.js";
import type { TokenSet } from "../../src/core/auth/types.js";
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

const CONTEXT = loginContextFor(
  { domain: "login.example.com", clientId: "client", audience: "https://api.example.com/" },
  { kind: "domain", domain: "kontent.ai" },
);

// Verbatim from @napi-rs/keyring 1.3.0's index.js.
const loaderErrors = [
  new Error(
    "Cannot find native binding. npm has a bug related to optional dependencies (https://github.com/npm/cli/issues/4828). Please try `npm i` again after removing both package-lock.json and node_modules directory.",
  ),
  new Error("Failed to load native binding"),
];

const LOCKED_STORE = new Error("Couldn't access platform storage: collection is locked");

// As keyring-core words NoStorageAccess and NoDefaultStore.
const storeErrors = [
  LOCKED_STORE,
  new Error("No default store has been set, so cannot search or create entries"),
];

describe("createKeyringStorage", () => {
  const read = async () => createKeyringStorage(CONTEXT).read();

  it.each(loaderErrors)("reports a missing native module for %s", async (loadError) => {
    keyring.loadError = loadError;

    const result = await read();

    assertErr(result);
    expect(result.error).toMatchObject({
      cause: loadError,
      unavailable: "native-module-missing",
    });
  });

  it.each(storeErrors)("reports an inaccessible store for %s", async (entryError) => {
    keyring.entryError = entryError;

    const result = await read();

    assertErr(result);
    expect(result.error).toMatchObject({ cause: entryError, unavailable: "store-inaccessible" });
  });

  it("leaves any other failure unclassified", async () => {
    keyring.entryError = new Error("Platform failure: errSecDuplicateItem");

    const result = await read();

    assertErr(result);
    expect(result.error).not.toHaveProperty("unavailable");
  });

  it.each([
    ["write", "storage-write-failed", async () => createKeyringStorage(CONTEXT).write(TOKENS)],
    ["clear", "storage-clear-failed", async () => createKeyringStorage(CONTEXT).clear()],
  ] as const)("classifies a %s failure the same way", async (_operation, kind, run) => {
    keyring.entryError = LOCKED_STORE;

    const result = await run();

    assertErr(result);
    expect(result.error).toMatchObject({
      kind,
      cause: LOCKED_STORE,
      unavailable: "store-inaccessible",
    });
  });
});

describe("createLegacyTokens", () => {
  it("resolves and says why at verbose when the entry cannot be removed", async () => {
    keyring.entryError = new Error("keychain locked");
    const logger = {
      info: vi.fn(),
      warning: vi.fn(),
      error: vi.fn(),
      isVerbose: true,
    } satisfies Logger;

    await expect(createLegacyTokens(logger).remove()).resolves.toBeUndefined();
    expect(logger.warning).toHaveBeenCalledWith(
      "verbose",
      "Could not remove the old keyring entry: keychain locked",
    );
  });
});
