import * as z from "zod/mini";

import { createLearnQuery, type LearnClient, type LearnQueryParams } from "../client.js";

export const EndpointDetailsSchema = z.record(z.string(), z.json());

export type EndpointDetails = z.infer<typeof EndpointDetailsSchema>;

// The route answers with up to ten candidates ranked by score, empty when nothing matches.
export const EndpointDetailsResponseSchema = z.object({
  json: z.array(EndpointDetailsSchema),
});

export const endpointDetails = (client: LearnClient, params: LearnQueryParams) =>
  createLearnQuery(client, "/endpoint-details", params, EndpointDetailsResponseSchema);
