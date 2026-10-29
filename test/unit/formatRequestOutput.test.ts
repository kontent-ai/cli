import { describe, expect, it } from "vitest";
import { formatRequestOutput } from "../../src/cli/commands/mapi/request/formatOutput.js";
import type { RequestOutcome } from "../../src/cli/commands/mapi/request/runRequest.js";
import type { ResolvedEnvId } from "../../src/core/environment/decideEnvId.js";
import { err, ok } from "../../src/core/lib/result.js";
import type { MapiResponse } from "../../src/core/mapi/raw/response.js";

const ENV_ID = "11111111-2222-3333-4444-555555555555";
const FLAG_ENV: ResolvedEnvId = { envId: ENV_ID, source: "flag" };
const STORED_ENV: ResolvedEnvId = { envId: ENV_ID, source: "stored" };

const outcome = (
  response: Partial<MapiResponse>,
  overrides: Partial<Omit<RequestOutcome, "response">> = {},
) =>
  ok({
    response: { statusCode: 200, statusText: "OK", headers: [], body: null, ...response },
    authSource: "login" as const,
    env: FLAG_ENV,
    ...overrides,
  });

const stderrText = (output: ReturnType<typeof formatRequestOutput>) =>
  output.stderr.map((line) => line.text).join("\n");

describe("formatRequestOutput", () => {
  it("keeps a dropped-body warning off stdout", () => {
    const output = formatRequestOutput(
      outcome({
        statusCode: 502,
        statusText: "Bad Gateway",
        headers: [
          { name: "Content-Type", value: "text/html; charset=utf-8" },
          { name: "Content-Length", value: "137" },
        ],
      }),
      false,
    );

    expect(output.stdout).toBe("");
    expect(output.stderr).toContainEqual(
      expect.objectContaining({
        level: "warning",
        text: expect.stringContaining("137 bytes of text/html"),
      }),
    );
    expect(output.isFailure).toBe(true);
  });

  it("announces an empty success body on stderr instead of leaving stdout silent", () => {
    const output = formatRequestOutput(
      outcome({ statusCode: 204, statusText: "No Content" }),
      false,
    );

    expect(output.stdout).toBe("");
    expect(output.stderr).toEqual([{ level: "info", text: "HTTP 204" }]);
    expect(output.isFailure).toBe(false);
  });

  it("prints a 4xx body on stdout and its diagnosis on stderr", () => {
    const output = formatRequestOutput(
      outcome({
        statusCode: 404,
        statusText: "Not Found",
        headers: [{ name: "content-type", value: "application/json" }],
        body: { message: "The requested content type was not found." },
      }),
      false,
    );

    expect(output.stdout).toContain("The requested content type was not found.");
    expect(stderrText(output)).toContain("HTTP 404");
    expect(stderrText(output)).not.toContain("The requested content type was not found.");
    expect(output.telemetry).toEqual({
      outcome: "fail",
      errorCode: "http-404",
      properties: { "status-code": 404, "auth-source": "login" },
    });
  });

  it("reports a transport failure on stderr and fails", () => {
    const output = formatRequestOutput(
      err({
        kind: "transport",
        message: "fetch failed: getaddrinfo ENOTFOUND",
        authSource: "login",
      }),
      false,
    );

    expect(output.stdout).toBe("");
    expect(stderrText(output)).toContain("fetch failed: getaddrinfo ENOTFOUND");
    expect(output.isFailure).toBe(true);
  });

  it("explains where a credential can come from when none is found", () => {
    const output = formatRequestOutput(
      err({ kind: "auth-failed", error: { kind: "not-logged-in" } }),
      false,
    );

    expect(stderrText(output)).toBe(
      "No Management API credential found. Run `kontent login`, or pass --mapiKey <key>, send an Authorization header, or set KONTENT_MAPI_KEY.",
    );
    expect(output.telemetry).toEqual({ outcome: "fail", errorCode: "auth:not-logged-in" });
  });

  it("tells how to set an environment when none is found", () => {
    const output = formatRequestOutput(err({ kind: "missing-env-id" }), false);

    expect(stderrText(output)).toContain("--envId <id>");
    expect(stderrText(output)).toContain("kontent environment use <id>");
    expect(output.telemetry).toEqual({ outcome: "fail", errorCode: "missing-env-id" });
  });

  it("points at the stored environment on 403", () => {
    const output = formatRequestOutput(
      outcome({ statusCode: 403, statusText: "Forbidden" }, { env: STORED_ENV }),
      false,
    );

    expect(stderrText(output)).toContain(
      `Used the stored default environment ${ENV_ID}. If that's the wrong one, change it with \`kontent environment use <id>\`, or pass --envId <id> for this call only.`,
    );
  });

  it("leaves the stored environment out of a 401 and points at the credential", () => {
    const output = formatRequestOutput(
      outcome({ statusCode: 401, statusText: "Unauthorized" }, { env: STORED_ENV }),
      false,
    );

    expect(stderrText(output)).toContain("Run `kontent login` to sign in again.");
    expect(stderrText(output)).not.toContain("Used the stored default environment");
  });

  it("leaves the stored-environment hint out when --envId was passed", () => {
    const output = formatRequestOutput(
      outcome({ statusCode: 403, statusText: "Forbidden" }),
      false,
    );

    expect(stderrText(output)).toBe("HTTP 403");
  });
});
