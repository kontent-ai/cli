import type { Header, HttpMethod } from "@kontent-ai/core-sdk";
import { err, isErr, ok, type Result } from "../../lib/result.js";
import { parseHeaders } from "./headers.js";
import { parseMethod } from "./method.js";

export type PlannedRequest = Readonly<{
  method: HttpMethod;
  headers: ReadonlyArray<Header>;
}>;

export type RequestArgsError = Readonly<{
  kind: "invalid-method" | "invalid-header";
  message: string;
}>;

export const planRequest = (
  args: Readonly<{
    method: string | undefined;
    header: ReadonlyArray<string> | undefined;
    hasBody: boolean;
  }>,
): Result<PlannedRequest, RequestArgsError> => {
  const method = parseMethod(args.method, args.hasBody);
  if (isErr(method)) {
    return err({ kind: "invalid-method", message: method.error });
  }

  // Where curl parity stops: curl does send `-X GET` with a body, we cannot - the
  // fetch spec forbids one on GET and undici throws before the request leaves.
  // Only an explicit `-X GET` reaches this.
  if (args.hasBody && method.value === "GET") {
    return err({
      kind: "invalid-method",
      message:
        "A GET request cannot carry a body. Use -X POST, PUT or PATCH with --input, or drop --input.",
    });
  }

  const headers = parseHeaders(args.header ?? []);
  if (isErr(headers)) {
    return err({ kind: "invalid-header", message: headers.error });
  }

  return ok({
    method: method.value,
    // The default goes first so an explicit -H Content-Type wins the merge.
    headers: args.hasBody
      ? [{ name: "Content-Type", value: "application/json" }, ...headers.value]
      : headers.value,
  });
};
