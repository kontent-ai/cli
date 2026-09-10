import * as z from "zod/mini";

import { createLearnQuery, type LearnClient, type LearnQueryParams } from "../client.js";

export const ObjectDetailsSchema = z.record(z.string(), z.json());

export type ObjectDetails = z.infer<typeof ObjectDetailsSchema>;

// The route answers with up to ten candidates ranked by score, empty when nothing matches.
export const ObjectDetailsResponseSchema = z.object({
  json: z.array(ObjectDetailsSchema),
});

export const objectDetails = (client: LearnClient, params: LearnQueryParams) =>
  createLearnQuery(client, "/object-details", params, ObjectDetailsResponseSchema);
