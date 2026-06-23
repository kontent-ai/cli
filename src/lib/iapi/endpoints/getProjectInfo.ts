import { createFetchQuery } from "@kontent-ai/core-sdk";
import * as z from "zod/mini";

import { type IapiClient, iapiEndpointUrl, iapiQueryBase } from "../client.js";

export const ProjectResponseSchema = z.object({
  projectGuid: z.string(),
  projectName: z.string(),
  projectContainerId: z.string(),
  projectContainerName: z.string(),
  projectContainerMasterProjectId: z.string(),
  inactive: z.boolean(),
  deactivatedAt: z.nullable(z.string()),
  activatedAt: z.nullable(z.string()),
  createdAt: z.string(),
  productionFrom: z.nullable(z.string()),
  productionTo: z.nullable(z.string()),
  subscriptionId: z.string(),
  projectLocationId: z.string(),
});

export type ProjectResponse = z.infer<typeof ProjectResponseSchema>;

export const getProjectInfo = (c: IapiClient, environmentId: string) =>
  createFetchQuery({
    url: iapiEndpointUrl(c.urlBase, `/api/project-management/${environmentId}`),
    schema: ProjectResponseSchema,
    ...iapiQueryBase(c),
  });
