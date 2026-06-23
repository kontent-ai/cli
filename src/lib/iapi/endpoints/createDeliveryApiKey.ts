import { createMutationQuery } from "@kontent-ai/core-sdk";

import { type IapiClient, iapiEndpointUrl, iapiQueryBase } from "../client.js";
import { ApiKeyDetailSchema } from "./getApiKeyDetail.js";

export type CreateDeliveryApiKeyInput = Readonly<{
  name: string;
  environments: ReadonlyArray<string>;
  hasPreviewDeliveryAccess: boolean;
  expiresAt: Date;
}>;

export const createDeliveryApiKey = (
  c: IapiClient,
  containerId: string,
  input: CreateDeliveryApiKeyInput,
) =>
  createMutationQuery({
    method: "POST",
    url: iapiEndpointUrl(c.urlBase, `/api/project-container/${containerId}/keys`),
    body: {
      name: input.name,
      shared_with_users: [],
      has_secure_delivery_access: false,
      has_preview_delivery_access: input.hasPreviewDeliveryAccess,
      has_access_to_all_environments: false,
      environments: input.environments,
      management_api_key_capabilities: null,
      expires_at: input.expiresAt.toISOString(),
      type: "delivery-api",
    },
    zodSchema: ApiKeyDetailSchema,
    ...iapiQueryBase(c),
  });
