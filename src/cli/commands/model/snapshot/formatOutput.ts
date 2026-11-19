import { match } from "ts-pattern";
import { isErr, type Result } from "../../../../core/lib/result.js";
import type { AuthSource } from "../../../../core/mapi/credential.js";
import { formatAuthError } from "../../shared/formatAuthError.js";
import {
  failedOutput,
  MISSING_ENV_ID_OUTPUT,
  type PassthroughOutput,
} from "../../shared/passthroughOutput.js";
import type { SnapshotError, SnapshotOutcome } from "./runSnapshot.js";

/** The manifest goes to stdout; what happened to the folder goes to stderr. */
export const formatSnapshotOutput = (
  result: Result<SnapshotOutcome, SnapshotError>,
  path: string,
): PassthroughOutput =>
  isErr(result)
    ? formatErrorOutput(result.error, path)
    : {
        stdout: result.value.manifest,
        stderr: [{ level: "info", text: formatSummary(result.value, path) }],
        isFailure: false,
        telemetry: { outcome: "succeed", properties: { "auth-source": result.value.authSource } },
      };

const formatSummary = (outcome: SnapshotOutcome, path: string): string =>
  outcome.written === 0 && outcome.deleted === 0
    ? `The snapshot of environment ${outcome.env.envId} in ${path} is up to date.`
    : `Saved the snapshot of environment ${outcome.env.envId} to ${path}: ${outcome.written} written, ${outcome.deleted} deleted, ${outcome.unchanged} unchanged.`;

const formatErrorOutput = (error: SnapshotError, path: string): PassthroughOutput =>
  match(error)
    .with({ kind: "missing-env-id" }, () => MISSING_ENV_ID_OUTPUT)
    .with({ kind: "refused-target" }, ({ reason }) =>
      failedOutput(
        `refused-target:${reason}`,
        reason === "foreign-manifest"
          ? `${path} has a manifest.json that isn't a snapshot's, so nothing was written. Pass --path with a new folder, an empty one, or a previous snapshot.`
          : `${path} holds other files and isn't a snapshot, so nothing was written. Pass --path with a new folder, an empty one, or a previous snapshot.`,
      ),
    )
    .with({ kind: "auth-failed" }, ({ error: authError }) =>
      failedOutput(
        `auth:${authError.kind}`,
        authError.kind === "not-logged-in"
          ? "No Management API credential found. Run `kontent login`, or pass --mapiKey <key>, or set KONTENT_MAPI_KEY."
          : formatAuthError(authError),
      ),
    )
    .with({ kind: "invalid-endpoint" }, ({ message }) => failedOutput("invalid-endpoint", message))
    .with({ kind: "transport" }, ({ kindName, message, authSource }) =>
      failedOutput("transport", `Couldn't fetch ${kindName}: ${message}`, {
        "auth-source": authSource,
      }),
    )
    .with({ kind: "http-failure" }, ({ kindName, status, authSource, env }) =>
      failedOutput(
        `http-${status}`,
        [
          `The Management API answered HTTP ${status} for ${kindName}, so nothing was written.`,
          ...(status === 401 ? [formatCredentialHint(authSource)] : []),
          ...(status === 403 && env.source === "stored"
            ? [
                `Used the stored default environment ${env.envId}. If that's the wrong one, change it with \`kontent environment use <id>\`, or pass --envId <id>.`,
              ]
            : []),
        ].join("\n"),
        { "auth-source": authSource },
      ),
    )
    .with({ kind: "unexpected-shape" }, ({ kindName }) =>
      failedOutput(
        "unexpected-shape",
        `The Management API's answer for ${kindName} had an unexpected shape, so nothing was written.`,
      ),
    )
    .with({ kind: "no-safe-name" }, ({ kindNames }) =>
      failedOutput(
        "no-safe-name",
        `Some entities in ${kindNames.join(", ")} have neither a safe codename nor a valid id, so nothing was written.`,
      ),
    )
    .with({ kind: "files-failed" }, ({ message }) =>
      failedOutput("files-failed", `Couldn't update ${path}: ${message}`),
    )
    .exhaustive();

const formatCredentialHint = (source: AuthSource): string =>
  match(source)
    .with("header", "mapi-key", () => "Check your Management API key.")
    .with("login", () => "Run `kontent login` to sign in again.")
    .exhaustive();
