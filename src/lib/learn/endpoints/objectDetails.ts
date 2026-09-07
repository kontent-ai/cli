import * as z from "zod/mini";

import { createLearnQuery, type LearnClient } from "../client.js";

export const ObjectDetailsSchema = z.object({
  title: z.string(),
  url: z.string(),
  apiReference: z.string(),
});

export type ObjectDetails = z.infer<typeof ObjectDetailsSchema>;

export const ObjectDetailsResponseSchema = z.object({ json: ObjectDetailsSchema });

export const objectDetails = (client: LearnClient, text: string) =>
  createLearnQuery(client, "/object-details", text, ObjectDetailsResponseSchema);
