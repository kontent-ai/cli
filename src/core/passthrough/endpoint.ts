import { err, ok, type Result } from "../lib/result.js";

export type EndpointError = Readonly<{
  kind: "absolute-url" | "traversal" | "empty";
  message: string;
}>;

export type ValidatedEndpoint = Readonly<{
  /** The path without leading slashes, query string included. */
  relative: string;
  encodedEnvId: string;
}>;

/**
 * The guards every passthrough endpoint goes through before an API places it
 * under its base URL: a non-empty path, never an absolute URL, and an environment
 * id that is not a dot segment. Where the path leads is checked on the built URL,
 * by `buildWithinScope`.
 */
export const validateEndpoint = (
  endpoint: string,
  params: Readonly<{ envId: string; apiName: string }>,
): Result<ValidatedEndpoint, EndpointError> => {
  const trimmed = endpoint.trim();

  if (trimmed === "") {
    return err({ kind: "empty", message: "The endpoint is empty." });
  }

  if (isAbsolute(trimmed)) {
    return err({
      kind: "absolute-url",
      message: `The endpoint ${JSON.stringify(endpoint)} must be a path, not an absolute URL. The host is always the ${params.apiName}.`,
    });
  }

  // The scope check refuses these too, but its message would blame the endpoint, not the id.
  if (params.envId === "." || params.envId === "..") {
    return err({
      kind: "traversal",
      message: `The environment id ${JSON.stringify(params.envId)} must not be "." or "..".`,
    });
  }

  // Strip leading slashes so "/types" and "types" resolve identically - the base
  // URL already carries any version prefix the path is appended to.
  const relative = trimmed.replace(/^\/+/, "");

  return ok({ relative, encodedEnvId: encodeURIComponent(params.envId) });
};

/** The path of a base URL without its trailing slash: "/v2" for ".../v2/", "" for a bare host. */
export const basePathOf = (baseUrl: string): string =>
  new URL(baseUrl).pathname.replace(/\/+$/, "");

/**
 * Appends `path` to the base URL and refuses the result unless it stays on the base origin
 * under `scopePrefix`. The built URL is what gets sent: the WHATWG parser drops tabs and line
 * breaks and resolves `..`, `%2e` and backslashes, so checking the typed text misses some
 * escapes. `scopePrefix` is compared literally, so a dot-segment environment id cannot widen it.
 */
export const buildWithinScope = (
  endpoint: string,
  params: Readonly<{ baseUrl: string; path: string; scopePrefix: string; scopeName: string }>,
): Result<URL, EndpointError> => {
  const url = new URL(`${params.baseUrl.replace(/\/+$/, "")}/${params.path}`);
  const isWithinScope =
    url.origin === new URL(params.baseUrl).origin && url.pathname.startsWith(params.scopePrefix);

  return isWithinScope
    ? ok(url)
    : err({
        kind: "traversal",
        message: `The endpoint ${JSON.stringify(endpoint)} leaves the ${params.scopeName}.`,
      });
};

const isAbsolute = (endpoint: string): boolean =>
  /^[a-z][a-z\d+\-.]*:/i.test(endpoint) || endpoint.startsWith("//");
