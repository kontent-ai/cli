import { map, type Result } from "../lib/result.js";
import { type EndpointError, validateEndpoint } from "../passthrough/endpoint.js";

/**
 * Turns a user-supplied endpoint into an absolute Management API URL. A path that
 * already starts with `projects/` is kept verbatim (with `{environment_id}` filled
 * in); anything else is scoped to the environment.
 */
export const resolveMapiEndpoint = (
  endpoint: string,
  params: Readonly<{ baseUrl: string; envId: string }>,
): Result<URL, EndpointError> =>
  map(
    validateEndpoint(endpoint, { envId: params.envId, apiName: "Management API" }),
    ({ relative, encodedEnvId }) => {
      const withEnvId = relative.replaceAll("{environment_id}", encodedEnvId);
      const path = withEnvId.startsWith("projects/")
        ? withEnvId
        : `projects/${encodedEnvId}/${withEnvId}`;

      return new URL(`${params.baseUrl.replace(/\/+$/, "")}/${path}`);
    },
  );
