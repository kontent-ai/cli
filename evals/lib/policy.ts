import type { BashInput, WebFetchInput } from "@anthropic-ai/claude-agent-sdk/sdk-tools";
import * as z from "zod/mini";
import { isNone, isSome, none, type Option, some } from "../../src/lib/option.js";
import { err, isErr, ok, type Result } from "../../src/lib/result.js";

export const AGENT_TOOLS: ReadonlyArray<string> = ["Bash", "WebFetch"];

export const DENIAL_PREFIX = "blocked by policy: ";

// `satisfies` fails typecheck when the SDK renames or retypes a field the schema reads.
export const bashInputSchema = z.object({ command: z.string() }) satisfies z.ZodMiniType<
  Pick<BashInput, "command">
>;
export const webFetchInputSchema = z.object({
  url: z.string(),
  prompt: z.string(),
}) satisfies z.ZodMiniType<WebFetchInput>;

const WEB_FETCH_ALLOWED_HOSTS: ReadonlyArray<string> = ["kontent.ai"];

export const AGENT_PERMISSION_RULES: ReadonlyArray<string> = [
  "Bash",
  ...WEB_FETCH_ALLOWED_HOSTS.map((host) => `WebFetch(domain:${host})`),
];

export type ToolPolicy = Readonly<{
  workspaceDir: string;
  mapiKey: string;
}>;

export type ToolCallRequest = Readonly<{ toolName: string; input: unknown }>;

export const applyToolPolicy = (
  policy: ToolPolicy,
  request: ToolCallRequest,
): Result<void, string> => {
  if (request.toolName === "Bash") {
    const parsed = bashInputSchema.safeParse(request.input);
    if (!parsed.success) {
      return err(`${DENIAL_PREFIX}malformed Bash input`);
    }
    const deniedToken = findPathOutsideWorkspace(
      parsed.data.command,
      workspaceDirAliases(policy.workspaceDir),
    );
    return isSome(deniedToken)
      ? err(`${DENIAL_PREFIX}command references a path outside the workspace: ${deniedToken.value}`)
      : ok(undefined);
  }
  if (request.toolName === "WebFetch") {
    const parsed = webFetchInputSchema.safeParse(request.input);
    if (!parsed.success) {
      return err(`${DENIAL_PREFIX}malformed WebFetch input`);
    }
    const violation = checkWebFetch(policy, parsed.data.url);
    return isErr(violation) ? err(`${DENIAL_PREFIX}${violation.error}`) : ok(undefined);
  }
  return ok(undefined);
};

// Conservative and simple by design: flags a token as escaping the workspace
// directory if it is home-relative, walks up via `..`, or is an absolute path
// under a filesystem root that holds user or system data. Bare API paths like
// `/types` and `/dev/null` stay allowed. False positives (denying something
// safe) are acceptable; false negatives are not.
export const findPathOutsideWorkspace = (
  command: string,
  workspaceDirs: ReadonlyArray<string>,
): Option<string> => {
  const token = command
    .split(/[\s<>|;&()]+/)
    .filter((token) => token !== "")
    .find((token) => isPathOutsideWorkspace(token, workspaceDirs));
  return token === undefined ? none : some(token);
};

// macOS hands out `/var/folders/...` from mkdtemp while `pwd` inside it
// reports `/private/var/folders/...`; both spellings count as inside.
export const workspaceDirAliases = (workspaceDir: string): ReadonlyArray<string> =>
  workspaceDir.startsWith("/private/")
    ? [workspaceDir, workspaceDir.slice("/private".length)]
    : [workspaceDir, `/private${workspaceDir}`];

// The host check backs the WebFetch(domain:...) rule, whose subdomain and redirect handling is undocumented.
export const checkWebFetch = (policy: ToolPolicy, url: string): Result<void, string> => {
  if (policy.mapiKey !== "" && url.includes(policy.mapiKey)) {
    return err("url contains the Management API key");
  }
  const host = parseHost(url);
  if (isNone(host)) {
    return err("url is not a valid http(s) url");
  }
  if (!WEB_FETCH_ALLOWED_HOSTS.includes(host.value)) {
    return err(`host is not allowed: ${host.value}`);
  }
  return ok(undefined);
};

const FILESYSTEM_ROOTS: ReadonlyArray<string> = [
  "/Users/",
  "/home/",
  "/root/",
  "/etc/",
  "/var/",
  "/private/",
  "/tmp/",
  "/opt/",
  "/usr/",
  "/Library/",
  "/Applications/",
  "/Volumes/",
  "/proc/",
  "/sys/",
  "/mnt/",
];

const isPathOutsideWorkspace = (token: string, workspaceDirs: ReadonlyArray<string>): boolean => {
  const path = token.replace(/^["']|["']$/g, "");
  if (
    path.startsWith("~") ||
    path.includes("$HOME") ||
    path.includes(`\${HOME}`) ||
    path.split("/").includes("..")
  ) {
    return true;
  }
  // A root's trailing slash means `path.startsWith(root)` misses the bare
  // root itself (e.g. `/etc` from `ls /etc`), so also match it without one.
  const isUnderRoot = FILESYSTEM_ROOTS.some(
    (root) => path === root.slice(0, -1) || path.startsWith(root),
  );
  const isInsideWorkspace = workspaceDirs.some((dir) => path === dir || path.startsWith(`${dir}/`));
  return isUnderRoot && !isInsideWorkspace;
};

const parseHost = (url: string): Option<string> => {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? some(parsed.hostname.toLowerCase())
      : none;
  } catch {
    return none;
  }
};
