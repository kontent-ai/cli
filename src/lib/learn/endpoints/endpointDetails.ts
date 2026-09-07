import * as z from "zod/mini";

import { createLearnQuery, type LearnClient } from "../client.js";

export const EndpointDetailsSchema = z.object({
  title: z.string(),
  url: z.string(),
  httpMethod: z.string(),
  apiReference: z.string(),
  endpointUrls: z.array(z.string()),
});

export type EndpointDetails = z.infer<typeof EndpointDetailsSchema>;

export const EndpointDetailsResponseSchema = z.object({ json: EndpointDetailsSchema });

export const endpointDetails = (client: LearnClient, text: string) =>
  createLearnQuery(client, "/endpoint-details", text, EndpointDetailsResponseSchema);
