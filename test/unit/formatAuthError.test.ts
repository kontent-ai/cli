import { describe, expect, it } from "vitest";
import { formatAuthError } from "../../src/cli/commands/shared/formatAuthError.js";

const storageKinds = [
  "storage-read-failed",
  "storage-write-failed",
  "storage-clear-failed",
] as const;

const cause = new Error("Platform failure");

describe("formatAuthError", () => {
  it.each(storageKinds)("tells a %s with a missing native module to reinstall", (kind) => {
    const loaderError = new Error(
      "Cannot find native binding. npm has a bug related to optional dependencies. Please try `npm i` again after removing both package-lock.json and node_modules directory.",
    );
    const message = formatAuthError({
      kind,
      cause: loaderError,
      unavailable: "native-module-missing",
    });

    expect(message.split("\n")[0]).toMatch(
      /^failed to \w+ stored tokens: the keyring module did not load\.$/,
    );
    expect(message).not.toContain("package-lock.json");
    expect(message).toContain("npm install -g @kontent-ai/cli");
    expect(message).toContain("--omit=optional");
    expect(message).not.toContain("gnome-keyring");
  });

  it.each(
    storageKinds,
  )("tells a %s with an inaccessible store to unlock or install one", (kind) => {
    const message = formatAuthError({ kind, cause, unavailable: "store-inaccessible" });

    expect(message).toContain("Platform failure");
    expect(message).toContain("Unlock it, or install one");
    expect(message).not.toContain("npm install");
  });

  it.each(storageKinds)("reports any other %s without a hint", (kind) => {
    expect(formatAuthError({ kind, cause }).split("\n")).toEqual([
      expect.stringContaining("Platform failure"),
    ]);
  });
});
