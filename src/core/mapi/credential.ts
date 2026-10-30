import type { Header } from "@kontent-ai/core-sdk";

/** Which of the three credentials a request ended up authenticating with. */
export type AuthSource = "login" | "mapi-key" | "header";

export type MapiCredentialDecision =
  | Readonly<{ source: "header" }>
  | Readonly<{ source: "mapi-key"; token: string }>
  | Readonly<{ source: "login" }>;

/**
 * Each source suppresses the ones below it, so a supplied credential never triggers
 * a keychain read that could fail on a machine that never ran `kontent login`.
 */
export const decideMapiCredential = (
  inputs: Readonly<{
    headers: ReadonlyArray<Header>;
    mapiKey: string | undefined;
    envMapiKey: string | undefined;
  }>,
): MapiCredentialDecision => {
  if (inputs.headers.some((header) => header.name.toLowerCase() === "authorization")) {
    return { source: "header" };
  }
  const suppliedKey = inputs.mapiKey ?? inputs.envMapiKey;
  if (suppliedKey !== undefined && suppliedKey !== "") {
    return { source: "mapi-key", token: suppliedKey };
  }
  return { source: "login" };
};
