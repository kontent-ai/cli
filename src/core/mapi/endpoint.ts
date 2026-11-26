import { flatMap, type Result } from "../lib/result.js";
import {
  basePathOf,
  buildWithinScope,
  type EndpointError,
  validateEndpoint,
} from "../passthrough/endpoint.js";

/**
 * Turns a user-supplied endpoint into an absolute Management API URL. A path that
 * already starts with `projects/` is kept verbatim (with `{environment_id}` filled
 * in) and must stay under `projects/`; anything else is scoped to the environment.
 */
export const resolveMapiEndpoint = (
  endpoint: string,
  params: Readonly<{ baseUrl: string; envId: string }>,
): Result<URL, EndpointError> =>
  flatMap(
    validateEndpoint(endpoint, { envId: params.envId, apiName: "Management API" }),
    ({ relative, encodedEnvId }) => {
      const withEnvId = relative.replaceAll("{environment_id}", encodedEnvId);
      const projectsPrefix = `${basePathOf(params.baseUrl)}/projects/`;

      return withEnvId.startsWith("projects/")
        ? buildWithinScope(endpoint, {
            baseUrl: params.baseUrl,
            path: withEnvId,
            scopePrefix: projectsPrefix,
            scopeName: "projects path",
          })
        : buildWithinScope(endpoint, {
            baseUrl: params.baseUrl,
            path: `projects/${encodedEnvId}/${withEnvId}`,
            scopePrefix: `${projectsPrefix}${encodedEnvId}/`,
            scopeName: "environment",
          });
    },
  );
