import type { KontentSdkError } from "@kontent-ai/core-sdk";
import { map, type Result } from "../../../core/lib/result.js";
import type { DeliveryKeyRequest } from "../../../core/project/deliveryKeyRequest.js";
import { fromSdkResult, type IapiClient } from "./client.js";
import { createDeliveryApiKey } from "./endpoints/createDeliveryApiKey.js";
import { getApiKeyDetail } from "./endpoints/getApiKeyDetail.js";
import { listApiKeys } from "./endpoints/listApiKeys.js";

export type DeliveryKeySummary = Readonly<{
  tokenSeedId: string;
  name: string;
  expiresAt: string;
}>;

export type DeliveryKeys = Readonly<{
  list: (
    containerId: string,
    envId: string,
  ) => Promise<Result<ReadonlyArray<DeliveryKeySummary>, KontentSdkError>>;
  viewApiKey: (
    containerId: string,
    tokenSeedId: string,
  ) => Promise<Result<string, KontentSdkError>>;
  create: (
    containerId: string,
    request: DeliveryKeyRequest,
  ) => Promise<Result<Readonly<{ name: string; apiKey: string }>, KontentSdkError>>;
}>;

export const createDeliveryKeys = (client: IapiClient): DeliveryKeys => ({
  list: async (containerId, envId) =>
    map(
      fromSdkResult(
        await listApiKeys(client, containerId, {
          apiKeyTypes: ["delivery-api"],
          environments: [envId],
        }).executeSafe(),
      ),
      (keys) =>
        keys.map((key) => ({
          tokenSeedId: key.token_seed_id,
          name: key.name,
          expiresAt: key.expires_at,
        })),
    ),
  viewApiKey: async (containerId, tokenSeedId) =>
    map(
      fromSdkResult(await getApiKeyDetail(client, containerId, tokenSeedId).fetchSafe()),
      (detail) => detail.api_key,
    ),
  create: async (containerId, request) =>
    map(
      fromSdkResult(await createDeliveryApiKey(client, containerId, request).executeSafe()),
      (created) => ({ name: created.name, apiKey: created.api_key }),
    ),
});
