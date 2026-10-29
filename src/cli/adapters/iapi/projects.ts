import type { KontentSdkError } from "@kontent-ai/core-sdk";
import type { Result } from "../../../core/lib/result.js";
import { fromSdkResult, type IapiClient } from "./client.js";
import { getProjectInfo } from "./endpoints/getProjectInfo.js";
import { listProjectProperties } from "./endpoints/listProjectProperties.js";

export type ProjectInfo = Readonly<{
  projectName: string;
  projectContainerId: string;
  subscriptionId: string;
}>;

export type ProjectProperty = Readonly<{ key: string; value: string }>;

export type Projects = Readonly<{
  info: (envId: string) => Promise<Result<ProjectInfo, KontentSdkError>>;
  properties: (envId: string) => Promise<Result<ReadonlyArray<ProjectProperty>, KontentSdkError>>;
}>;

export const createProjects = (client: IapiClient): Projects => ({
  info: async (envId) => fromSdkResult(await getProjectInfo(client, envId).fetchSafe()),
  properties: async (envId) =>
    fromSdkResult(await listProjectProperties(client, envId).fetchSafe()),
});
