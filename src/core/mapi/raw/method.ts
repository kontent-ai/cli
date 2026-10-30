import type { HttpMethod } from "@kontent-ai/core-sdk";
import { err, ok, type Result } from "../../lib/result.js";

export const parseMethod = (
  raw: string | undefined,
  hasBody: boolean,
): Result<HttpMethod, string> => {
  if (raw === undefined) {
    return ok(hasBody ? "POST" : "GET");
  }

  const method = HTTP_METHODS.find((known) => known === raw.toUpperCase());
  if (method === undefined) {
    return err(`Unsupported HTTP method "${raw}". Use one of ${HTTP_METHODS.join(", ")}.`);
  }
  return ok(method);
};

const HTTP_METHODS = [
  "GET",
  "POST",
  "PUT",
  "DELETE",
  "PATCH",
] as const satisfies ReadonlyArray<HttpMethod>;
