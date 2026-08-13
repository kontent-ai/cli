import { err, fromThrowable, isOk, ok, type Result } from "../../result.js";

export type EndpointError = Readonly<{
  kind: "absolute-url" | "traversal" | "empty";
  message: string;
}>;

/**
 * Turns a user-supplied endpoint into an absolute Management API URL. A path that
 * already starts with `projects/` is kept verbatim (with `{environment_id}` filled
 * in); anything else is scoped to the environment.
 */
export const resolveEndpoint = (
  endpoint: string,
  params: Readonly<{ baseUrl: string; envId: string }>,
): Result<URL, EndpointError> => {
  const trimmed = endpoint.trim();

  if (trimmed === "") {
    return err({ kind: "empty", message: "The endpoint is empty." });
  }

  if (isAbsolute(trimmed)) {
    return err({
      kind: "absolute-url",
      message: `The endpoint "${endpoint}" must be a path, not an absolute URL. The host is always the Management API.`,
    });
  }

  const relative = trimmed.replace(/^\/+/, "");

  if (hasTraversal(relative)) {
    return err({
      kind: "traversal",
      message: `The endpoint "${endpoint}" must not contain ".." path segments.`,
    });
  }

  const encodedEnvId = encodeURIComponent(params.envId);
  const withEnvId = relative.replaceAll("{environment_id}", encodedEnvId);
  const path = withEnvId.startsWith("projects/")
    ? withEnvId
    : `projects/${encodedEnvId}/${withEnvId}`;

  return ok(new URL(`${params.baseUrl.replace(/\/+$/, "")}/${path}`));
};

const isAbsolute = (endpoint: string): boolean =>
  /^[a-z][a-z\d+\-.]*:/i.test(endpoint) || endpoint.startsWith("//");

const hasTraversal = (relative: string): boolean =>
  (relative.split("?")[0] ?? relative).split("/").some((segment) => decodeSafely(segment) === "..");

// A malformed percent-escape is not traversal; keep the raw segment and let the URL carry it.
const decodeSafely = (segment: string): string => {
  const decoded = fromThrowable(
    () => decodeURIComponent(segment),
    () => segment,
  );
  return isOk(decoded) ? decoded.value : decoded.error;
};
