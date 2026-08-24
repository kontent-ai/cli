import type { HttpMethod } from "@kontent-ai/core-sdk";
import { err, ok, type Result } from "../../result.js";

export const parseMethod = (
  raw: string | undefined,
  hasBody: boolean,
): Result<HttpMethod, string> => {
  if (raw === undefined) {
    return ok(hasBody ? "POST" : "GET");
  }

  const method = httpMethods.find((known) => known === raw.toUpperCase());
  if (method === undefined) {
    return err(`Unsupported HTTP method "${raw}". Use one of ${httpMethods.join(", ")}.`);
  }
  return ok(method);
};

const httpMethods = [
  "GET",
  "POST",
  "PUT",
  "DELETE",
  "PATCH",
] as const satisfies ReadonlyArray<HttpMethod>;
