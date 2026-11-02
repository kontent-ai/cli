import { err, fromThrowable, isOk, ok, type Result } from "../lib/result.js";

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
 * under its base URL: a non-empty path, never an absolute URL, no `..` segments.
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
      message: `The endpoint "${endpoint}" must be a path, not an absolute URL. The host is always the ${params.apiName}.`,
    });
  }

  // Strip leading slashes so "/types" and "types" resolve identically - the base
  // URL already carries any version prefix the path is appended to.
  const relative = trimmed.replace(/^\/+/, "");

  if (hasTraversal(relative)) {
    return err({
      kind: "traversal",
      message: `The endpoint "${endpoint}" must not contain ".." path segments.`,
    });
  }

  if (hasTraversal(params.envId)) {
    return err({
      kind: "traversal",
      message: `The environment id "${params.envId}" must not contain ".." path segments.`,
    });
  }

  return ok({ relative, encodedEnvId: encodeURIComponent(params.envId) });
};

const isAbsolute = (endpoint: string): boolean =>
  /^[a-z][a-z\d+\-.]*:/i.test(endpoint) || endpoint.startsWith("//");

// Split on backslashes too: WHATWG treats them as separators in an https URL, so
// "types\..\..\secret" collapses out of the environment scope exactly like the
// forward-slash form. Percent-encoded separators (%2f, %5c) stay encoded in the
// path and cannot traverse, so only literal ones matter here.
const hasTraversal = (relative: string): boolean =>
  (relative.split("?")[0] ?? relative)
    .split(/[/\\]/)
    .some((segment) => decodeSafely(segment) === "..");

// A malformed percent-escape is not traversal; keep the raw segment and let the URL carry it.
const decodeSafely = (segment: string): string => {
  const decoded = fromThrowable(
    () => decodeURIComponent(segment),
    () => segment,
  );
  return isOk(decoded) ? decoded.value : decoded.error;
};
