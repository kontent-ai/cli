import { describe, expect, it } from "vitest";
import { formatAuthError } from "../../src/cli/commands/shared/formatAuthError.js";

const cause = new Error("Platform failure");

describe("formatAuthError", () => {
  it("tells a read failure with a missing native module to reinstall", () => {
    const loaderError = new Error(
      "Cannot find native binding. npm has a bug related to optional dependencies. Please try `npm i` again after removing both package-lock.json and node_modules directory.",
    );
    const message = formatAuthError({
      kind: "storage-read-failed",
      cause: loaderError,
      unavailable: "native-module-missing",
    });

    expect(message.split("\n")[0]).toBe(
      "failed to read stored tokens: the keyring module did not load.",
    );
    expect(message).not.toContain("package-lock.json");
    expect(message).toContain("npm install -g @kontent-ai/cli");
    expect(message).toContain("--omit=optional");
    expect(message).not.toContain("gnome-keyring");
  });

  it("tells a write failure with an inaccessible store to unlock or install one", () => {
    const message = formatAuthError({
      kind: "storage-write-failed",
      cause,
      unavailable: "store-inaccessible",
    });

    expect(message).toContain("failed to write stored tokens: Platform failure");
    expect(message).toContain("Unlock it, or install one");
    expect(message).not.toContain("npm install");
  });

  it("reports any other clear failure without a hint", () => {
    expect(formatAuthError({ kind: "storage-clear-failed", cause }).split("\n")).toEqual([
      "failed to clear stored tokens: Platform failure",
    ]);
  });
});
