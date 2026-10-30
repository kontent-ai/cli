import type { KontentSdkError } from "@kontent-ai/core-sdk";
import type { Result } from "../../../core/lib/result.js";
import { fromSdkResult, type IapiClient } from "./client.js";
import { getUser, type UserInfo } from "./endpoints/getUser.js";

export type Users = Readonly<{
  current: () => Promise<Result<UserInfo, KontentSdkError>>;
}>;

export const createUsers = (client: IapiClient): Users => ({
  current: async () => fromSdkResult(await getUser(client).fetchSafe()),
});
