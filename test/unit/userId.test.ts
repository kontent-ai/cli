import { describe, expect, it, vi } from "vitest";
import { ensureUserIdCached, type UserIdEffects } from "../../src/cli/adapters/auth/userId.js";
import type { Logger } from "../../src/cli/log.js";
import { err, ok } from "../../src/core/lib/result.js";

const CORRUPT = {
  message: "Config file at /config/kontent/cli/config.json is not valid JSON. Fix or delete it.",
};

const fakeLogger = () =>
  ({
    info: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    isVerbose: true,
  }) satisfies Logger;

describe("userId cache with an unreadable config", () => {
  // Skipped silently: a broken config also turns telemetry off, so the userId would never be used.
  it("skips the /user request, the write and any message", async () => {
    const effects = {
      logger: fakeLogger(),
      users: { current: vi.fn(async () => await Promise.resolve(ok({ userId: "user" }))) },
      config: {
        read: vi.fn(async () => await Promise.resolve(err(CORRUPT))),
        write: vi.fn(async () => await Promise.resolve(err(CORRUPT.message))),
      },
    } satisfies UserIdEffects;

    await ensureUserIdCached(effects, { shouldForceRefresh: true });

    expect(effects.users.current).not.toHaveBeenCalled();
    expect(effects.config.write).not.toHaveBeenCalled();
    expect(effects.logger.warning).not.toHaveBeenCalled();
  });
});
