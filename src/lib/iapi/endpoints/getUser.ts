import { createFetchQuery } from "@kontent-ai/core-sdk";
import { z } from "zod";

import { type IapiClient, iapiEndpointUrl, iapiQueryBase } from "../client.js";

export const UserInfoSchema = z.object({
  userId: z.string(),
  isEmailVerified: z.boolean().optional(),
  hadTrial: z.boolean().optional(),
});

export type UserInfo = z.infer<typeof UserInfoSchema>;

export const getUser = (c: IapiClient) =>
  createFetchQuery({
    url: iapiEndpointUrl(c.urlBase, "/api/user"),
    zodSchema: UserInfoSchema,
    ...iapiQueryBase(c),
  });
