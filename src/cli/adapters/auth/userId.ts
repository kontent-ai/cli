import type { BaseUrl } from "@kontent-ai/core-sdk";

import { isErr } from "../../../core/lib/result.js";
import type { Logger } from "../../log.js";
import { type CliConfigStore, cliConfigStore } from "../config/cliConfig.js";
import { createIapiClient } from "../iapi/client.js";
import { createUsers, type Users } from "../iapi/users.js";

export type UserIdEffects = Readonly<{
  logger: Logger;
  users: Users;
  config: Pick<CliConfigStore, "read" | "write">;
}>;

// Best-effort: never throws, so a /user failure can't break login.
export const ensureUserIdCached = async (
  effects: UserIdEffects,
  options: Readonly<{ shouldForceRefresh: boolean }>,
): Promise<void> => {
  const cached = (await effects.config.read()).userId;
  if (cached !== undefined && !options.shouldForceRefresh) {
    return;
  }

  const user = await effects.users.current();
  if (isErr(user)) {
    effects.logger.warning("verbose", `Could not cache userId: ${user.error.message}`);
    return;
  }

  const written = await effects.config.write({ userId: user.value.userId });
  if (isErr(written)) {
    effects.logger.warning("verbose", `Could not persist userId: ${written.error}`);
  }
};

export type UserIdCache = Readonly<{
  ensure: (
    accessToken: string,
    options: Readonly<{ shouldForceRefresh: boolean }>,
  ) => Promise<void>;
}>;

export const createUserIdCache = (logger: Logger, baseUrl: BaseUrl): UserIdCache => ({
  ensure: async (accessToken, options) =>
    ensureUserIdCached(
      {
        logger,
        users: createUsers(createIapiClient({ token: accessToken, baseUrl })),
        config: cliConfigStore,
      },
      options,
    ),
});
