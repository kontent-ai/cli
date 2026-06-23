import { createFetchQuery } from "@kontent-ai/core-sdk";
import * as z from "zod/mini";

import { type IapiClient, iapiEndpointUrl, iapiQueryBase } from "../client.js";

export const UserInfoSchema = z.object({
  userId: z.string(),
  isEmailVerified: z.optional(z.boolean()),
  hadTrial: z.optional(z.boolean()),
});

export type UserInfo = z.infer<typeof UserInfoSchema>;

export const getUser = (c: IapiClient) =>
  createFetchQuery({
    url: iapiEndpointUrl(c.urlBase, "/api/user"),
    schema: UserInfoSchema,
    ...iapiQueryBase(c),
  });
