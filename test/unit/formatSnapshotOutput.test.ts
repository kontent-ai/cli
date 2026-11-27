import { describe, expect, it } from "vitest";
import { formatSnapshotOutput } from "../../src/cli/commands/model/snapshot/formatOutput.js";
import type {
  SnapshotError,
  SnapshotOutcome,
} from "../../src/cli/commands/model/snapshot/runSnapshot.js";
import type { ResolvedEnvId } from "../../src/core/environment/envId.js";
import { err, ok } from "../../src/core/lib/result.js";

const ENV_ID = "11111111-2222-3333-4444-555555555555";
const FLAG_ENV: ResolvedEnvId = { envId: ENV_ID, source: "flag" };
const STORED_ENV: ResolvedEnvId = { envId: ENV_ID, source: "stored" };
const PATH = "./model-snapshot";
const MANIFEST = '{\n  "format_version": "1.0"\n}\n';

const outcome = (overrides: Partial<SnapshotOutcome> = {}) =>
  ok<SnapshotOutcome>({
    manifest: MANIFEST,
    env: FLAG_ENV,
    authSource: "login",
    written: 3,
    deleted: 1,
    unchanged: 4,
    omittedJsonParameters: 0,
    ...overrides,
  });

const failure = (error: SnapshotError) => formatSnapshotOutput(err(error), PATH);

const stderrText = (output: ReturnType<typeof formatSnapshotOutput>) =>
  output.stderr.map((line) => line.text).join("\n");

describe("formatSnapshotOutput", () => {
  it("prints the manifest on stdout and what changed on stderr", () => {
    const output = formatSnapshotOutput(outcome(), PATH);

    expect(output.stdout).toBe(MANIFEST);
    expect(output.stderr).toEqual([
      {
        level: "info",
        text: `Saved the snapshot of environment ${ENV_ID} to ${PATH}: 3 written, 1 deleted, 4 unchanged.`,
      },
    ]);
    expect(output.isFailure).toBe(false);
    expect(output.telemetry).toEqual({
      outcome: "succeed",
      properties: { "auth-source": "login" },
    });
  });

  it("still prints the manifest when nothing changed", () => {
    const output = formatSnapshotOutput(outcome({ written: 0, deleted: 0, unchanged: 8 }), PATH);

    expect(output.stdout).toBe(MANIFEST);
    expect(stderrText(output)).toBe(
      `The snapshot of environment ${ENV_ID} in ${PATH} is up to date.`,
    );
    expect(output.isFailure).toBe(false);
  });

  it.each([
    { count: 1, text: "Left out the json_parameters of 1 custom element:" },
    { count: 3, text: "Left out the json_parameters of 3 custom elements:" },
  ])("says on stderr that $count json_parameters were left out", ({ count, text }) => {
    const output = formatSnapshotOutput(outcome({ omittedJsonParameters: count }), PATH);

    expect(output.stderr).toHaveLength(2);
    expect(output.stderr[1]).toEqual({ level: "info", text: expect.stringContaining(text) });
    expect(output.stdout).toBe(MANIFEST);
  });

  it("tells how to set an environment when none is found", () => {
    const output = failure({ kind: "missing-env-id" });

    expect(output.stdout).toBe("");
    expect(stderrText(output)).toContain("--envId <id>");
    expect(stderrText(output)).toContain("kontent environment use <id>");
    expect(output.isFailure).toBe(true);
    expect(output.telemetry).toEqual({ outcome: "fail", errorCode: "missing-env-id" });
  });

  it.each([
    { reason: "has-other-files" as const, text: "holds other files and isn't a snapshot" },
    { reason: "foreign-manifest" as const, text: "has a manifest.json that isn't a snapshot's" },
  ])("says why it refused a target ($reason) and which targets work", ({ reason, text }) => {
    const output = failure({ kind: "refused-target", reason });

    expect(stderrText(output)).toContain(`${PATH} ${text}, so nothing was written.`);
    expect(stderrText(output)).toContain("a new folder, an empty one, or a previous snapshot");
    expect(output.isFailure).toBe(true);
    expect(output.telemetry).toEqual({ outcome: "fail", errorCode: `refused-target:${reason}` });
  });

  it("explains where a credential can come from when none is found", () => {
    const output = failure({ kind: "auth-failed", error: { kind: "not-logged-in" } });

    expect(stderrText(output)).toBe(
      "No Management API credential found. Run `kontent login`, or pass --mapiKey <key>, or set KONTENT_MAPI_KEY.",
    );
    expect(output.telemetry).toEqual({ outcome: "fail", errorCode: "auth:not-logged-in" });
  });

  it("asks to log in again when the session expired", () => {
    const output = failure({
      kind: "auth-failed",
      error: { kind: "session-expired", refreshError: { kind: "refresh-rejected", cause: "x" } },
    });

    expect(stderrText(output)).toContain("kontent login");
    expect(output.telemetry).toEqual({ outcome: "fail", errorCode: "auth:session-expired" });
  });

  it("names the kind a transport failure hit", () => {
    const output = failure({
      kind: "transport",
      kindName: "types",
      message: "fetch failed: getaddrinfo ENOTFOUND",
      authSource: "mapi-key",
    });

    expect(output.stdout).toBe("");
    expect(stderrText(output)).toBe("Couldn't fetch types: fetch failed: getaddrinfo ENOTFOUND");
    expect(output.telemetry).toEqual({
      outcome: "fail",
      errorCode: "transport",
      properties: { "auth-source": "mapi-key" },
    });
  });

  it.each([
    { authSource: "login" as const, hint: "Run `kontent login` to sign in again." },
    { authSource: "mapi-key" as const, hint: "Check your Management API key." },
  ])("points a 401 at the $authSource credential", ({ authSource, hint }) => {
    const output = failure({
      kind: "http-failure",
      kindName: "types",
      status: 401,
      authSource,
      env: STORED_ENV,
    });

    expect(stderrText(output)).toBe(
      `The Management API answered HTTP 401 for types, so nothing was written.\n${hint}`,
    );
    expect(output.telemetry).toEqual({
      outcome: "fail",
      errorCode: "http-401",
      properties: { "auth-source": authSource },
    });
  });

  it("points at the stored environment on 403", () => {
    const output = failure({
      kind: "http-failure",
      kindName: "workflows",
      status: 403,
      authSource: "login",
      env: STORED_ENV,
    });

    expect(stderrText(output)).toContain("answered HTTP 403 for workflows");
    expect(stderrText(output)).toContain(`Used the stored default environment ${ENV_ID}.`);
  });

  it("leaves the stored-environment hint out when --envId was passed", () => {
    const output = failure({
      kind: "http-failure",
      kindName: "workflows",
      status: 403,
      authSource: "login",
      env: FLAG_ENV,
    });

    expect(stderrText(output)).toBe(
      "The Management API answered HTTP 403 for workflows, so nothing was written.",
    );
  });

  it.each<Readonly<{ error: SnapshotError; errorCode: string; text: string }>>([
    {
      error: { kind: "invalid-endpoint", message: "The URL is outside Kontent.ai." },
      errorCode: "invalid-endpoint",
      text: "The URL is outside Kontent.ai.",
    },
    {
      error: { kind: "unexpected-shape", kindName: "languages" },
      errorCode: "unexpected-shape",
      text: "answer for languages had an unexpected shape, so nothing was written.",
    },
    {
      error: { kind: "no-safe-name", kindNames: ["types", "languages"] },
      errorCode: "no-safe-name",
      text: "Some entities in types, languages have neither a safe codename nor a valid id",
    },
    {
      error: { kind: "files-failed", message: "EACCES: permission denied" },
      errorCode: "files-failed",
      text: `Couldn't update ${PATH}: EACCES: permission denied`,
    },
  ])("fails with $errorCode on stderr only", ({ error, errorCode, text }) => {
    const output = failure(error);

    expect(output.stdout).toBe("");
    expect(output.stderr).toEqual([{ level: "error", text: expect.stringContaining(text) }]);
    expect(output.isFailure).toBe(true);
    expect(output.telemetry).toEqual({ outcome: "fail", errorCode });
  });
});
