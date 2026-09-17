import { describe, expect, it } from "vitest";
import { none, some } from "../../src/lib/option.js";
import { err, isErr, isOk, ok } from "../../src/lib/result.js";
import {
  AGENT_PERMISSION_RULES,
  applyToolPolicy,
  checkWebFetch,
  DENIAL_PREFIX,
  findPathOutsideWorkspace,
  type ToolPolicy,
  workspaceDirAliases,
} from "../lib/policy.js";

const workspace = "/var/folders/ab/kontent-eval-x";
const workspaceDirs = workspaceDirAliases(workspace);

describe("findPathOutsideWorkspace", () => {
  it.each([
    "kontent mapi GET /types",
    "kontent mapi GET types --mapiKey $EVALS_MAPI_KEY",
    "kontent --help > /dev/null 2>&1",
    `cat ${workspace}/body.json`,
    `cd /private${workspace} && ls`,
    "ls ./sub",
    "cat x > /dev/null",
    "echo a|grep b",
  ])("allows %s", (command) => {
    expect(findPathOutsideWorkspace(command, workspaceDirs)).toEqual(none);
  });

  it.each([
    ["cat ~/.kontent/config.json", "~/.kontent/config.json"],
    ["ls $HOME/.claude", "$HOME/.claude"],
    ["cat /etc/passwd", "/etc/passwd"],
    ["cat /Users/someone/.zshrc", "/Users/someone/.zshrc"],
    [`cat ${workspace}/../other/secret`, `${workspace}/../other/secret`],
    ["cat ../secret", "../secret"],
    ["cd ..", ".."],
    ["cd foo/..", "foo/.."],
    ["cat /var/folders/ab/other-dir/file", "/var/folders/ab/other-dir/file"],
    ['grep -r key "/Users/someone/src"', '"/Users/someone/src"'],
    ["ls /etc", "/etc"],
    ["cat /Users", "/Users"],
    [`echo \${HOME}`, `\${HOME}`],
    ["cat</etc/passwd", "/etc/passwd"],
    ["true;cat /etc/passwd", "/etc/passwd"],
    ["(cat /etc/passwd)", "/etc/passwd"],
  ])("denies %s", (command, expected) => {
    expect(findPathOutsideWorkspace(command, workspaceDirs)).toEqual(some(expected));
  });
});

describe("workspaceDirAliases", () => {
  it("pairs the mkdtemp path with its /private twin", () => {
    expect(workspaceDirAliases("/var/x")).toEqual(["/var/x", "/private/var/x"]);
    expect(workspaceDirAliases("/private/var/x")).toEqual(["/private/var/x", "/var/x"]);
  });
});

describe("checkWebFetch", () => {
  const key = "secret-key-123";
  const policy: ToolPolicy = { workspaceDir: workspace, mapiKey: key };

  it.each([
    "https://kontent.ai/learn/docs/apis/openapi/management-api-v2",
    "https://KONTENT.AI/learn",
    "http://kontent.ai/",
  ])("allows %s", (url) => {
    expect(isOk(checkWebFetch(policy, url))).toBe(true);
  });

  it.each([
    ["https://example.com/", "host is not allowed: example.com"],
    ["https://learn.kontent.ai/", "host is not allowed: learn.kontent.ai"],
    ["https://evil.com/?kontent.ai", "host is not allowed: evil.com"],
    ["not a url", "url is not a valid http(s) url"],
    [`https://kontent.ai/?k=${key}`, "url contains the Management API key"],
    [`https://example.com/?k=${key}`, "url contains the Management API key"],
  ])("denies %s", (url, expected) => {
    expect(checkWebFetch(policy, url)).toEqual(err(expected));
  });

  it("does not treat an empty key as contained in every url", () => {
    const noKeyPolicy: ToolPolicy = { workspaceDir: workspace, mapiKey: "" };
    expect(checkWebFetch(noKeyPolicy, "https://kontent.ai/")).toEqual(ok(undefined));
  });
});

describe("applyToolPolicy", () => {
  const policy: ToolPolicy = { workspaceDir: workspace, mapiKey: "secret" };

  it("allows a Bash call inside the workspace", () => {
    const verdict = applyToolPolicy(policy, {
      toolName: "Bash",
      input: { command: "kontent auth status" },
    });

    expect(verdict).toEqual(ok(undefined));
  });

  it("denies a Bash call outside the workspace, prefixed with DENIAL_PREFIX", () => {
    const verdict = applyToolPolicy(policy, {
      toolName: "Bash",
      input: { command: "cat /etc/passwd" },
    });

    expect(isErr(verdict)).toBe(true);
    expect(isErr(verdict) && verdict.error).toBe(
      `${DENIAL_PREFIX}command references a path outside the workspace: /etc/passwd`,
    );
  });

  it("allows a WebFetch call to kontent.ai", () => {
    const verdict = applyToolPolicy(policy, {
      toolName: "WebFetch",
      input: { url: "https://kontent.ai/learn", prompt: "how do I do x" },
    });

    expect(verdict).toEqual(ok(undefined));
  });

  it("denies a WebFetch call to another host", () => {
    const verdict = applyToolPolicy(policy, {
      toolName: "WebFetch",
      input: { url: "https://example.com/", prompt: "how do I do x" },
    });

    expect(verdict).toEqual(err(`${DENIAL_PREFIX}host is not allowed: example.com`));
  });

  it("denies malformed input", () => {
    const verdict = applyToolPolicy(policy, {
      toolName: "Bash",
      input: { notCommand: "oops" },
    });

    expect(verdict).toEqual(err(`${DENIAL_PREFIX}malformed Bash input`));
  });

  it("allows any other tool", () => {
    const verdict = applyToolPolicy(policy, {
      toolName: "Read",
      input: { path: "/etc/passwd" },
    });

    expect(verdict).toEqual(ok(undefined));
  });
});

describe("AGENT_PERMISSION_RULES", () => {
  it("scopes WebFetch to the allowed hosts rather than allowing it bare", () => {
    expect(AGENT_PERMISSION_RULES).toEqual(["Bash", "WebFetch(domain:kontent.ai)"]);
  });
});
