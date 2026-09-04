import { describe, expect, it } from "vitest";
import { presentResponse } from "../../src/commands/mapi/presentResponse.js";
import type { MapiResponse } from "../../src/core/mapi/request.js";

const response = (overrides: Partial<MapiResponse> = {}): MapiResponse => ({
  statusCode: 200,
  statusText: "OK",
  headers: [{ name: "content-type", value: "application/json" }],
  body: { name: "Article" },
  ...overrides,
});

describe("presentResponse", () => {
  it("re-indents a JSON body", () => {
    const presented = presentResponse(response(), false);

    expect(presented.payload).toBe('{\n  "name": "Article"\n}\n');
    expect(presented.droppedBodyWarning).toBeUndefined();
  });

  // Media types are case-insensitive (RFC 9110) and the API sends a charset
  // parameter, so neither may decide whether the body counts as JSON.
  it.each([
    "Application/JSON; charset=utf-8",
    "application/json;charset=utf-8",
    // What a proxy produces when it joins two Content-Type headers.
    "application/json, application/json",
  ])("treats %j as JSON", (value) => {
    const presented = presentResponse(
      response({ headers: [{ name: "Content-Type", value }] }),
      false,
    );

    expect(presented.payload).toBe('{\n  "name": "Article"\n}\n');
  });

  // core-sdk yields null for an absent body, a skipped one and a literal JSON
  // null alike; with a JSON content type the honest reading is the literal.
  it("prints a literal null body", () => {
    const presented = presentResponse(response({ body: null }), false);

    expect(presented.payload).toBe("null\n");
  });

  it("reports a dropped body with its byte count when the length is known", () => {
    const presented = presentResponse(
      response({
        statusCode: 502,
        statusText: "Bad Gateway",
        headers: [
          { name: "Content-Type", value: "text/html; charset=utf-8" },
          { name: "Content-Length", value: "137" },
        ],
        body: null,
      }),
      false,
    );

    expect(presented.payload).toBe("");
    expect(presented.droppedBodyWarning).toBe(
      "The response carried 137 bytes of text/html, which is not JSON and was not shown.",
    );
  });

  // A chunked response sends no Content-Length, so the content type is the only
  // signal left that a body existed and was dropped.
  it("reports a dropped body that came without a content length", () => {
    const presented = presentResponse(
      response({ headers: [{ name: "Content-Type", value: "text/csv" }], body: null }),
      false,
    );

    expect(presented.payload).toBe("");
    expect(presented.droppedBodyWarning).toBe(
      "The response carried a text/csv body, which is not JSON and was not shown.",
    );
  });

  it("stays silent when the response carried nothing at all", () => {
    const presented = presentResponse(
      response({ statusCode: 204, statusText: "No Content", headers: [], body: null }),
      false,
    );

    expect(presented.payload).toBe("");
    expect(presented.droppedBodyWarning).toBeUndefined();
  });

  it("puts the status line and headers before the body when asked", () => {
    const presented = presentResponse(response(), true);

    expect(presented.payload).toBe(
      'HTTP/1.1 200 OK\ncontent-type: application/json\n\n{\n  "name": "Article"\n}\n',
    );
  });

  it("still writes the status line when the body was dropped", () => {
    const presented = presentResponse(
      response({
        statusCode: 502,
        statusText: "Bad Gateway",
        headers: [{ name: "Content-Type", value: "text/html" }],
        body: null,
      }),
      true,
    );

    expect(presented.payload).toBe("HTTP/1.1 502 Bad Gateway\nContent-Type: text/html\n\n");
    expect(presented.droppedBodyWarning).toContain("text/html");
  });
});
