import type { Header } from "@kontent-ai/core-sdk";
import { err, ok, type Result } from "../lib/result.js";

/** Which credential a Delivery request ended up carrying, if any. */
export type DapiAuthSource = "header" | "dapi-key" | "none";

export type DapiCredential =
  | Readonly<{ source: "header" }>
  | Readonly<{ source: "dapi-key"; key: string }>
  | Readonly<{ source: "none" }>;

export type DapiCredentialError = Readonly<{ kind: "missing-preview-key" }>;

/**
 * Delivery is public by default, so no credential is a valid outcome, except for preview,
 * which always needs a key: failing here saves a request that can only answer 401.
 */
export const decideDapiCredential = (
  inputs: Readonly<{
    headers: ReadonlyArray<Header>;
    dapiKey: string | undefined;
    envDapiKey: string | undefined;
    isPreview: boolean;
  }>,
): Result<DapiCredential, DapiCredentialError> => {
  if (inputs.headers.some((header) => header.name.toLowerCase() === "authorization")) {
    return ok({ source: "header" });
  }
  const suppliedKey = [inputs.dapiKey, inputs.envDapiKey].find(
    (key) => key !== undefined && key.trim() !== "",
  );
  if (suppliedKey !== undefined) {
    return ok({ source: "dapi-key", key: suppliedKey });
  }
  return inputs.isPreview ? err({ kind: "missing-preview-key" }) : ok({ source: "none" });
};
