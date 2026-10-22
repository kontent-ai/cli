import { type Result, tryAsync } from "../../../core/lib/result.js";
import { createMapiClient } from "./client.js";
import { mapiErrorMessage, mapiErrorStatus } from "./error.js";

export type EnvironmentInfo = Readonly<{ projectName: string; environmentName: string }>;

export type MapiRequestError = Readonly<{ status: number | undefined; message: string }>;

export type Environments = Readonly<{
  describe: (
    envId: string,
    accessToken: string,
  ) => Promise<Result<EnvironmentInfo, MapiRequestError>>;
}>;

export const createEnvironments = (baseUrl: string): Environments => ({
  describe: async (envId, accessToken) =>
    tryAsync(
      async () => {
        const client = createMapiClient({ token: accessToken, envId, baseUrl });
        const { project } = (await client.environmentInformation().toPromise()).data;
        return { projectName: project.name, environmentName: project.environment };
      },
      (cause): MapiRequestError => ({
        status: mapiErrorStatus(cause),
        message: mapiErrorMessage(cause),
      }),
    ),
});
