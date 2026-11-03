import { map, type Result } from "../lib/result.js";
import { type EndpointError, validateEndpoint } from "../passthrough/endpoint.js";

/** Turns a user-supplied endpoint, relative to the environment, into an absolute Delivery API URL. */
export const resolveDapiEndpoint = (
  endpoint: string,
  params: Readonly<{ baseUrl: string; envId: string }>,
): Result<URL, EndpointError> =>
  map(
    validateEndpoint(endpoint, { envId: params.envId, apiName: "Delivery API" }),
    ({ relative, encodedEnvId }) =>
      new URL(`${params.baseUrl.replace(/\/+$/, "")}/${encodedEnvId}/${relative}`),
  );
