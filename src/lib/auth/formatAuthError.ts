import { match } from "ts-pattern";

import { errorMessage } from "../error.js";
import type { AuthError } from "./types.js";

export const formatAuthError = (error: AuthError): string =>
  match(error)
    .with({ kind: "not-logged-in" }, () => "Not logged in. Run `kontent login` first.")
    .with({ kind: "access-denied" }, () => "login cancelled")
    .with({ kind: "expired-token" }, () => "device flow expired")
    .with(
      { kind: "discovery-failed" },
      ({ cause }) => `failed to discover Auth0 issuer: ${errorMessage(cause)}`,
    )
    .with(
      { kind: "device-auth-failed" },
      ({ cause }) => `failed to start device authorization: ${errorMessage(cause)}`,
    )
    .with(
      { kind: "poll-failed" },
      ({ code, description }) =>
        `device flow failed (${code})${description ? `: ${description}` : ""}`,
    )
    .with({ kind: "refresh-failed" }, ({ cause }) => `token refresh failed: ${errorMessage(cause)}`)
    .with(
      { kind: "refresh-rejected" },
      ({ cause }) => `refresh token rejected: ${errorMessage(cause)}`,
    )
    .with(
      { kind: "storage-read-failed" },
      ({ cause }) => `failed to read stored tokens: ${errorMessage(cause)}`,
    )
    .with(
      { kind: "storage-write-failed" },
      ({ cause }) => `failed to write stored tokens: ${errorMessage(cause)}`,
    )
    .with(
      { kind: "storage-clear-failed" },
      ({ cause }) => `failed to clear stored tokens: ${errorMessage(cause)}`,
    )
    .with({ kind: "unknown" }, ({ cause }) => `unexpected error: ${errorMessage(cause)}`)
    .exhaustive();
