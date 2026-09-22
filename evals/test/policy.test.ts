import { describe, expect, it } from "vitest";
import { err, ok } from "../../src/lib/result.js";
import { applyToolPolicy, DENIAL_PREFIX, type ToolPolicy } from "../lib/policy.js";

const workspace = "/var/folders/ab/kontent-eval-x";
const key = "secret-key-123";
const policy: ToolPolicy = { workspaceDir: workspace, mapiKey: key };

const bash = (command: string, activePolicy: ToolPolicy = policy) =>
  applyToolPolicy(activePolicy, { toolName: "Bash", input: { command } });

const webFetch = (url: string, activePolicy: ToolPolicy = policy) =>
  applyToolPolicy(activePolicy, { toolName: "WebFetch", input: { url, prompt: "how do I do x" } });

const outsideWorkspace = (token: string) =>
  err(`${DENIAL_PREFIX}command references a path outside the workspace: ${token}`);

describe("Bash", () => {
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
    expect(bash(command)).toEqual(ok(undefined));
  });

  it.each([
    ["cat ~/.kontent/config.json", "~/.kontent/config.json"],
    ["ls $HOME/.claude", "$HOME/.claude"],
    ["cat /etc/passwd", "/etc/passwd"],
    ["cat /Users/someone/.zshrc", "/Users/someone/.zshrc"],
    [`cat ${workspace}/../other/secret`, `${workspace}/../other/secret`],
    ["cat ../secret", "../secret"],
    ["cat /var/folders/ab/other-dir/file", "/var/folders/ab/other-dir/file"],
    ['grep -r key "/Users/someone/src"', '"/Users/someone/src"'],
    ["ls /etc", "/etc"],
    ["cat /Users", "/Users"],
    [`echo \${HOME}`, `\${HOME}`],
    ["cat</etc/passwd", "/etc/passwd"],
    ["true;cat /etc/passwd", "/etc/passwd"],
    ["(cat /etc/passwd)", "/etc/passwd"],
  ])("denies %s", (command, expected) => {
    expect(bash(command)).toEqual(outsideWorkspace(expected));
  });

  it("treats a /private-prefixed workspace and its mkdtemp spelling as the same dir", () => {
    const privatePolicy: ToolPolicy = { ...policy, workspaceDir: `/private${workspace}` };

    expect(bash(`cat ${workspace}/body.json`, privatePolicy)).toEqual(ok(undefined));
    expect(bash(`cat /private${workspace}/body.json`, privatePolicy)).toEqual(ok(undefined));
  });

  it("denies malformed input", () => {
    const verdict = applyToolPolicy(policy, { toolName: "Bash", input: { notCommand: "oops" } });

    expect(verdict).toEqual(err(`${DENIAL_PREFIX}malformed Bash input`));
  });
});

describe("WebFetch", () => {
  it.each([
    "https://kontent.ai/learn/docs/apis/openapi/management-api-v2",
    "https://KONTENT.AI/learn",
    "http://kontent.ai/",
  ])("allows %s", (url) => {
    expect(webFetch(url)).toEqual(ok(undefined));
  });

  it.each([
    ["https://example.com/", "host is not allowed: example.com"],
    ["https://learn.kontent.ai/", "host is not allowed: learn.kontent.ai"],
    ["https://evil.com/?kontent.ai", "host is not allowed: evil.com"],
    ["not a url", "url is not a valid http(s) url"],
    [`https://kontent.ai/?k=${key}`, "url contains the Management API key"],
    [`https://example.com/?k=${key}`, "url contains the Management API key"],
  ])("denies %s", (url, expected) => {
    expect(webFetch(url)).toEqual(err(`${DENIAL_PREFIX}${expected}`));
  });

  it("does not treat an empty key as contained in every url", () => {
    const noKeyPolicy: ToolPolicy = { ...policy, mapiKey: "" };

    expect(webFetch("https://kontent.ai/", noKeyPolicy)).toEqual(ok(undefined));
  });

  it("denies malformed input", () => {
    const verdict = applyToolPolicy(policy, { toolName: "WebFetch", input: { url: 1 } });

    expect(verdict).toEqual(err(`${DENIAL_PREFIX}malformed WebFetch input`));
  });
});

describe("other tools", () => {
  // The hook only inspects Bash and WebFetch; every other tool is kept off the
  // agent by the `tools` list in agent.ts, so the policy itself stays open.
  it("leaves any other tool to the agent's tool list", () => {
    const verdict = applyToolPolicy(policy, { toolName: "Read", input: { path: "README.md" } });

    expect(verdict).toEqual(ok(undefined));
  });
});
