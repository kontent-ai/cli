import { createFetchQuery } from "@kontent-ai/core-sdk";
import { z } from "zod";

import { type IapiClient, iapiEndpointUrl, iapiQueryBase } from "../client.js";

export const ProjectPropertySchema = z.object({
  projectId: z.string(),
  key: z.string(),
  value: z.string(),
});

export const ProjectPropertyListSchema = z.array(ProjectPropertySchema);

export type ProjectProperty = z.infer<typeof ProjectPropertySchema>;

export const listProjectProperties = (c: IapiClient, environmentId: string) =>
  createFetchQuery({
    url: iapiEndpointUrl(c.urlBase, `/api/project/${environmentId}/property`),
    zodSchema: ProjectPropertyListSchema,
    ...iapiQueryBase(c),
  });
