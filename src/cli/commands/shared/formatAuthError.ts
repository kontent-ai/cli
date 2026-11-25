import { match } from "ts-pattern";
import type { AuthError, KeyringUnavailability } from "../../../core/auth/types.js";
import { errorMessage } from "../../../core/lib/error.js";
import { sessionExpiredMessage } from "./sessionExpired.js";

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
    .with({ kind: "session-expired" }, () => sessionExpiredMessage)
    .with({ kind: "storage-read-failed" }, ({ cause, unavailable }) =>
      storageFailure("read", cause, unavailable),
    )
    .with({ kind: "storage-write-failed" }, ({ cause, unavailable }) =>
      storageFailure("write", cause, unavailable),
    )
    .with({ kind: "storage-clear-failed" }, ({ cause, unavailable }) =>
      storageFailure("clear", cause, unavailable),
    )
    .with({ kind: "unknown" }, ({ cause }) => `unexpected error: ${errorMessage(cause)}`)
    .exhaustive();

type StorageOperation = "read" | "write" | "clear";

const NATIVE_MODULE_MISSING_HINT =
  "Reinstall the CLI (for example `npm install -g @kontent-ai/cli`) without `--omit=optional`; on a platform with no prebuilt module, the keyring cannot be used.";

const STORE_INACCESSIBLE_HINT =
  "The system keyring is locked or missing. Unlock it, or install one (for example gnome-keyring on Linux), and try again.";

const storageFailure = (
  operation: StorageOperation,
  cause: unknown,
  unavailable: KeyringUnavailability | undefined,
): string =>
  match(unavailable)
    .with(undefined, () => `failed to ${operation} stored tokens: ${errorMessage(cause)}`)
    // The loader's own message advises reinstalling npm dependencies, which contradicts the hint.
    .with(
      "native-module-missing",
      () =>
        `failed to ${operation} stored tokens: the keyring module did not load.\n${NATIVE_MODULE_MISSING_HINT}`,
    )
    .with(
      "store-inaccessible",
      () =>
        `failed to ${operation} stored tokens: ${errorMessage(cause)}\n${STORE_INACCESSIBLE_HINT}`,
    )
    .exhaustive();
