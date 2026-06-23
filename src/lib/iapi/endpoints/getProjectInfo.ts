import { createFetchQuery } from "@kontent-ai/core-sdk";
import { z } from "zod";

import { type IapiClient, iapiEndpointUrl, iapiQueryBase } from "../client.js";

export const ProjectResponseSchema = z.object({
  projectGuid: z.string(),
  projectName: z.string(),
  projectContainerId: z.string(),
  projectContainerName: z.string(),
  projectContainerMasterProjectId: z.string(),
  inactive: z.boolean(),
  deactivatedAt: z.string().nullable(),
  activatedAt: z.string().nullable(),
  createdAt: z.string(),
  productionFrom: z.string().nullable(),
  productionTo: z.string().nullable(),
  subscriptionId: z.string(),
  projectLocationId: z.string(),
});

export type ProjectResponse = z.infer<typeof ProjectResponseSchema>;

export const getProjectInfo = (c: IapiClient, environmentId: string) =>
  createFetchQuery({
    url: iapiEndpointUrl(c.urlBase, `/api/project-management/${environmentId}`),
    zodSchema: ProjectResponseSchema,
    ...iapiQueryBase(c),
  });
