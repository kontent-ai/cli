import { AdapterParseError, type KontentSdkError } from "@kontent-ai/core-sdk";
import { describe, expect, it } from "vitest";
import {
  isNodeFetchTimeout,
  isNodeFetchTimeoutError,
} from "../../src/cli/adapters/http/nodeFetchTimeout.js";
import { nodeFetchTimeoutError } from "../helpers/nodeFetchTimeoutError.js";

// core-sdk wraps a failed body read once more before it reports a parseError.
const bodyTimeoutParseError = (): AdapterParseError =>
  new AdapterParseError({
    message: "Failed to parse the response.",
    error: nodeFetchTimeoutError("UND_ERR_BODY_TIMEOUT"),
  });

describe("isNodeFetchTimeout", () => {
  it("recognizes the headers timeout behind fetch's TypeError", () => {
    expect(isNodeFetchTimeout(nodeFetchTimeoutError("UND_ERR_HEADERS_TIMEOUT"))).toBe(true);
  });

  it("recognizes the body timeout behind fetch's TypeError", () => {
    expect(isNodeFetchTimeout(nodeFetchTimeoutError("UND_ERR_BODY_TIMEOUT"))).toBe(true);
  });

  it("recognizes a timeout core-sdk wrapped once more", () => {
    expect(isNodeFetchTimeout(bodyTimeoutParseError())).toBe(true);
  });

  it("rejects a plain error", () => {
    const error = new TypeError("fetch failed", { cause: new Error("read ECONNRESET") });

    expect(isNodeFetchTimeout(error)).toBe(false);
  });

  it("stops on a cause chain that loops back on itself", () => {
    const error = new Error("outer");
    const inner = new Error("inner", { cause: error });
    Object.assign(error, { cause: inner });

    expect(isNodeFetchTimeout(error)).toBe(false);
  });
});

describe("isNodeFetchTimeoutError", () => {
  it("recognizes a headers timeout reported as an adapter error", () => {
    const details: KontentSdkError["details"] = {
      reason: "adapterError",
      originalError: nodeFetchTimeoutError("UND_ERR_HEADERS_TIMEOUT"),
    };

    expect(isNodeFetchTimeoutError(details)).toBe(true);
  });

  it("recognizes a body timeout reported as a parse error", () => {
    const details: KontentSdkError["details"] = {
      reason: "parseError",
      originalError: bodyTimeoutParseError(),
    };

    expect(isNodeFetchTimeoutError(details)).toBe(true);
  });

  it("rejects an adapter error that is not a timeout", () => {
    const details: KontentSdkError["details"] = {
      reason: "adapterError",
      originalError: new TypeError("fetch failed", { cause: new Error("read ECONNRESET") }),
    };

    expect(isNodeFetchTimeoutError(details)).toBe(false);
  });
});
