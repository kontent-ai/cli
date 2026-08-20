import type { Header } from "@kontent-ai/core-sdk";
import { map, ok, type Result } from "../result.js";
import { getValidAccessToken } from "./tokenAccess.js";
import type { AuthError } from "./types.js";

/** Which of the three credentials a request ended up authenticating with. */
export type AuthSource = "login" | "mapi-key" | "header";

export type Credential = Readonly<{ token?: string | undefined; source: AuthSource }>;

/**
 * Each source suppresses the ones below it, so a supplied credential never triggers
 * a keychain read that could fail on a machine that never ran `kontent login`.
 *
 * `KONTENT_MAPI_KEY` is read here rather than through a yargs option: the CLI does
 * not map env vars onto flags (see `src/index.ts`). It keeps the key off argv, so
 * CI and shared shells do not leak it through `ps` or shell history.
 */
export const resolveMapiCredential = async (
  headers: ReadonlyArray<Header>,
  mapiKey: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): Promise<Result<Credential, AuthError>> => {
  if (headers.some((header) => header.name.toLowerCase() === "authorization")) {
    return ok({ source: "header" });
  }
  const suppliedKey = mapiKey ?? env.KONTENT_MAPI_KEY;
  if (suppliedKey !== undefined && suppliedKey !== "") {
    return ok({ token: suppliedKey, source: "mapi-key" });
  }
  return map(await getValidAccessToken(), (token) => ({ token, source: "login" }) as const);
};
