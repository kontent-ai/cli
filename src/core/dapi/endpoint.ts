import { flatMap, type Result } from "../lib/result.js";
import {
  basePathOf,
  buildWithinScope,
  type EndpointError,
  validateEndpoint,
} from "../passthrough/endpoint.js";

/** Turns a user-supplied endpoint, relative to the environment, into an absolute Delivery API URL. */
export const resolveDapiEndpoint = (
  endpoint: string,
  params: Readonly<{ baseUrl: string; envId: string }>,
): Result<URL, EndpointError> =>
  flatMap(
    validateEndpoint(endpoint, { envId: params.envId, apiName: "Delivery API" }),
    ({ relative, encodedEnvId }) =>
      buildWithinScope(endpoint, {
        baseUrl: params.baseUrl,
        path: `${encodedEnvId}/${relative}`,
        scopePrefix: `${basePathOf(params.baseUrl)}/${encodedEnvId}/`,
        scopeName: "environment",
      }),
  );
