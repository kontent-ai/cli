import type { Header } from "@kontent-ai/core-sdk";
import { describe, expect, it } from "vitest";
import {
  closePages,
  formatPage,
  formatRequestOutput,
} from "../../src/cli/commands/dapi/request/formatOutput.js";
import type { PrintedOutcome } from "../../src/cli/commands/dapi/request/runRequest.js";
import type { PagedEnd } from "../../src/core/dapi/paging.js";
import { none, some } from "../../src/core/lib/option.js";
import { err, ok } from "../../src/core/lib/result.js";

const responseOutcome = (
  statusCode: number,
  authSource: "header" | "dapi-key" | "none",
  extraHeaders: ReadonlyArray<Header> = [],
): PrintedOutcome => ({
  kind: "response",
  response: {
    statusCode,
    statusText: "",
    headers: [{ name: "content-type", value: "application/json" }, ...extraHeaders],
    body: { message: "body" },
  },
  authSource,
});

const FEED_RESUME = { endpoint: "items-feed", continuationToken: "token-4" };

const pagedEnd = (end: PagedEnd): PrintedOutcome => ({
  kind: "paged-end",
  end,
  authSource: "none",
});

const errorText = (output: ReturnType<typeof formatRequestOutput>): string =>
  output.stderr
    .filter((line) => line.level === "error")
    .map((line) => line.text)
    .join("\n");

describe("formatRequestOutput (dapi)", () => {
  it.each([
    { authSource: "none", hint: "This environment has secure access enabled." },
    { authSource: "dapi-key", hint: "Check your Delivery API key" },
    { authSource: "header", hint: "Check the Authorization header you supplied." },
  ] as const)("explains a 401 sent with $authSource", ({ authSource, hint }) => {
    const output = formatRequestOutput(ok(responseOutcome(401, authSource)), false);

    expect(output.isFailure).toBe(true);
    expect(output.stdout).toContain('"message": "body"');
    expect(errorText(output)).toContain(hint);
    expect(output.telemetry).toEqual({
      outcome: "fail",
      errorCode: "http-401",
      properties: { "status-code": 401, "auth-source": authSource },
    });
  });

  it.each([
    { name: "says", token: "token-2", hasHint: true },
    { name: "does not say", token: undefined, hasHint: false },
  ])("$name more pages exist when the response carries X-Continuation", ({ token, hasHint }) => {
    const headers = token === undefined ? [] : [{ name: "X-Continuation", value: token }];
    const output = formatRequestOutput(ok(responseOutcome(200, "none", headers)), false);

    expect(output.stderr.some((line) => line.text.includes("Add --paginate"))).toBe(hasHint);
  });

  it("prints one JSON document per page, or one array with --slurp", () => {
    const pages = [
      { payload: { items: [1] }, pageNumber: 1 },
      { payload: { items: [2] }, pageNumber: 2 },
    ];
    const print = (shouldSlurp: boolean): string =>
      pages.map((page) => formatPage(page, shouldSlurp)).join("") + closePages(shouldSlurp, true);

    expect(print(false)).toBe(
      `${JSON.stringify({ items: [1] }, null, 2)}\n${JSON.stringify({ items: [2] }, null, 2)}\n`,
    );
    expect(JSON.parse(print(true))).toEqual([{ items: [1] }, { items: [2] }]);
    expect(closePages(true, false)).toBe("");
  });

  it("tells how to continue after --maxPages", () => {
    const output = formatRequestOutput(
      ok(pagedEnd({ kind: "complete", pageCount: 3, resume: some(FEED_RESUME) })),
      false,
    );

    expect(output.stdout).toBe("");
    expect(output.stderr).toEqual([
      {
        level: "info",
        text: "Stopped after 3 pages (--maxPages). To continue, run:\n  kontent dapi 'items-feed' --paginate -H 'X-Continuation: token-4' (plus your other options)",
      },
    ]);
  });

  it("quotes the resume command so a quote in the endpoint survives the shell", () => {
    const output = formatRequestOutput(
      ok(
        pagedEnd({
          kind: "complete",
          pageCount: 1,
          resume: some({ endpoint: "items-feed?elements.title=Don't", continuationToken: "t" }),
        }),
      ),
      false,
    );

    expect(output.stderr[0]?.text).toContain(
      "kontent dapi 'items-feed?elements.title=Don'\\''t' --paginate -H 'X-Continuation: t'",
    );
  });

  it("says nothing after a complete run", () => {
    const output = formatRequestOutput(
      ok(pagedEnd({ kind: "complete", pageCount: 2, resume: none })),
      false,
    );

    expect(output.stderr).toEqual([]);
    expect(output.isFailure).toBe(false);
  });

  it("fails a later page with where to retry from", () => {
    const output = formatRequestOutput(
      ok(pagedEnd({ kind: "page-failed", pageNumber: 4, reason: "HTTP 500", resume: FEED_RESUME })),
      false,
    );

    expect(output.isFailure).toBe(true);
    expect(errorText(output)).toContain("Page 4 failed: HTTP 500.");
    expect(errorText(output)).toContain("-H 'X-Continuation: token-4'");
    expect(output.telemetry).toEqual({
      outcome: "fail",
      errorCode: "page-failed",
      properties: { "auth-source": "none" },
    });
  });

  it("points a keyless preview at the ways to pass a key", () => {
    const output = formatRequestOutput(err({ kind: "missing-preview-key" }), false);

    expect(errorText(output)).toContain("KONTENT_DAPI_KEY");
    expect(output.telemetry).toEqual({ outcome: "fail", errorCode: "missing-preview-key" });
  });
});
