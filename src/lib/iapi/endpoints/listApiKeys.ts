import { createMutationQuery } from "@kontent-ai/core-sdk";
import * as z from "zod/mini";

import { type IapiClient, iapiEndpointUrl, iapiQueryBase } from "../client.js";

export const ApiKeyTypeSchema = z.enum([
  "unknown",
  "delivery-api",
  "management-api-pat",
  "management-api",
  "subscription-api",
  "web-spotlight-api",
  "delivery-api-primary",
  "delivery-api-secondary",
  "preview-delivery-api-primary",
  "preview-delivery-api-secondary",
]);

export type ApiKeyType = z.infer<typeof ApiKeyTypeSchema>;

export const ApiKeyListingItemSchema = z.object({
  token_seed_id: z.string(),
  name: z.string(),
  userId: z.string(),
  type: ApiKeyTypeSchema,
  has_access_to_all_environments: z.boolean(),
  environments: z.array(z.string()),
  expires_at: z.string(),
});

export const ApiKeyListingSchema = z.array(ApiKeyListingItemSchema);

export type ApiKeyListingItem = z.infer<typeof ApiKeyListingItemSchema>;

export type ListApiKeysFilter = Readonly<{
  query?: string;
  apiKeyTypes?: ReadonlyArray<ApiKeyType>;
  environments?: ReadonlyArray<string>;
}>;

export const listApiKeys = (c: IapiClient, containerId: string, filter: ListApiKeysFilter = {}) =>
  createMutationQuery({
    method: "POST",
    url: iapiEndpointUrl(c.urlBase, `/api/project-container/${containerId}/keys/listing`),
    body: {
      query: filter.query ?? null,
      api_key_types: filter.apiKeyTypes ?? null,
      environments: filter.environments ?? null,
    },
    schema: ApiKeyListingSchema,
    ...iapiQueryBase(c),
  });
