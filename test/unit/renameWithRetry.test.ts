import { describe, expect, it, vi } from "vitest";
import { renameWithRetry } from "../../src/cli/adapters/files/files.js";

describe("atomic write rename retry", () => {
  const failingWith = (code: string) => Object.assign(new Error(code), { code });

  // Antivirus and indexers on Windows briefly lock a freshly written file.
  it("succeeds after a transient EBUSY", async () => {
    const renameFile = vi
      .fn<(from: string, to: string) => Promise<void>>()
      .mockRejectedValueOnce(failingWith("EBUSY"))
      .mockResolvedValueOnce(undefined);

    await renameWithRetry(renameFile, "config.json.tmp", "config.json");

    expect(renameFile).toHaveBeenCalledTimes(2);
    expect(renameFile).toHaveBeenLastCalledWith("config.json.tmp", "config.json");
  });

  it.each(["EPERM", "EBUSY", "EACCES"])("gives up on %s after three retries", async (code) => {
    const renameFile = vi
      .fn<(from: string, to: string) => Promise<void>>()
      .mockRejectedValue(failingWith(code));

    await expect(renameWithRetry(renameFile, "config.json.tmp", "config.json")).rejects.toThrow(
      code,
    );
    expect(renameFile).toHaveBeenCalledTimes(4);
  });

  it("does not retry other errors", async () => {
    const renameFile = vi
      .fn<(from: string, to: string) => Promise<void>>()
      .mockRejectedValue(failingWith("ENOSPC"));

    await expect(renameWithRetry(renameFile, "config.json.tmp", "config.json")).rejects.toThrow(
      "ENOSPC",
    );
    expect(renameFile).toHaveBeenCalledOnce();
  });
});
