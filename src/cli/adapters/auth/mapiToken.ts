import { match } from "ts-pattern";
import type { AuthError } from "../../../core/auth/types.js";
import { map, ok, type Result } from "../../../core/lib/result.js";
import type { MapiCredentialDecision } from "../../../core/mapi/credential.js";
import type { Session } from "./tokenAccess.js";

/**
 * The bearer token a Management API credential stands for: the supplied key, or the login
 * session's access token. `undefined` when the request carries its own Authorization header.
 */
export const mapiToken = async (
  credential: MapiCredentialDecision,
  session: Session,
): Promise<Result<string | undefined, AuthError>> =>
  match(credential)
    .with(
      { source: "header" },
      async (): Promise<Result<string | undefined, AuthError>> => ok(undefined),
    )
    .with({ source: "mapi-key" }, async ({ token }) => ok(token))
    .with({ source: "login" }, async () =>
      map(await session.tokens(), (tokens) => tokens.accessToken),
    )
    .exhaustive();
