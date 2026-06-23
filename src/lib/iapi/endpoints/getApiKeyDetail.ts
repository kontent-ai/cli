import { createFetchQuery, jsonValueSchema } from "@kontent-ai/core-sdk";
import * as z from "zod/mini";

import { type IapiClient, iapiEndpointUrl, iapiQueryBase } from "../client.js";
import { ApiKeyTypeSchema } from "./listApiKeys.js";

export const ApiKeyDetailSchema = z.object({
  token_seed_id: z.string(),
  api_key: z.string(),
  name: z.string(),
  type: ApiKeyTypeSchema,
  shared_with_users: z.array(z.string()),
  has_secure_delivery_access: z.boolean(),
  has_preview_delivery_access: z.boolean(),
  has_access_to_all_environments: z.boolean(),
  environments: z.array(z.string()),
  expires_at: z.string(),
  management_api_key_capabilities: jsonValueSchema,
});

export type ApiKeyDetail = z.infer<typeof ApiKeyDetailSchema>;

export const getApiKeyDetail = (c: IapiClient, containerId: string, tokenSeedId: string) =>
  createFetchQuery({
    url: iapiEndpointUrl(c.urlBase, `/api/project-container/${containerId}/keys/${tokenSeedId}`),
    schema: ApiKeyDetailSchema,
    ...iapiQueryBase(c),
  });
