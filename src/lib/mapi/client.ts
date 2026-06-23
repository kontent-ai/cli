import { HttpService } from "@kontent-ai/core-sdk-v10";
import { createManagementClient, type ManagementClient } from "@kontent-ai/management-sdk";

import { kontentManagementUrl } from "../config/kontentUrl.js";

export type MapiClient = ManagementClient;

export const createMapiClient = ({
  token,
  envId,
}: {
  readonly token: string;
  readonly envId: string;
}): MapiClient =>
  createManagementClient({
    environmentId: envId,
    apiKey: token,
    baseUrl: kontentManagementUrl(),
    httpService: new HttpService({ logErrorsToConsole: false }),
  });
