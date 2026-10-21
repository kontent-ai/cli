import { HttpService } from "@kontent-ai/core-sdk-v10";
import { createManagementClient, type ManagementClient } from "@kontent-ai/management-sdk";

export type MapiClient = ManagementClient;

export const createMapiClient = ({
  token,
  envId,
  baseUrl,
}: {
  readonly token: string;
  readonly envId: string;
  readonly baseUrl: string;
}): MapiClient =>
  createManagementClient({
    environmentId: envId,
    apiKey: token,
    baseUrl,
    httpService: new HttpService({ logErrorsToConsole: false }),
  });
