import { intro, note, outro } from "@clack/prompts";
import { match } from "ts-pattern";
import { getAuthenticatedIapiClient } from "../../../core/iapi/authenticatedClient.js";
import {
  type BootstrapError,
  type BootstrapParams,
  performBootstrap,
} from "../../../core/project/bootstrap.js";
import { supportedProjectTypes } from "../../../core/project/samples.js";
import { formatAuthError } from "../../../lib/auth/formatAuthError.js";
import { formatIapiError } from "../../../lib/iapi/formatIapiError.js";
import { createMapiClient } from "../../../lib/mapi/client.js";
import { isErr } from "../../../lib/result.js";
import type { Telemetry } from "../../../lib/telemetry/tracking.js";
import { logError } from "../../../log.js";
import type { RegisterCommand } from "../../../types/yargs.js";

export const register: RegisterCommand = (sub, deps) =>
  sub.command({
    command: "bootstrap",
    describe: "Clone a sample app for an environment and wire its .env",
    builder: (b) =>
      b
        .option("envId", {
          type: "string",
          demandOption: true,
          describe: "Environment ID (Guid)",
        })
        .option("path", {
          type: "string",
          default: "./karma-nextjs-app",
          describe: "Target directory for the cloned app (must be empty or non-existent)",
        }),
    handler: async (args) => runBootstrap(args, deps.telemetry),
  });

const runBootstrap = async (params: BootstrapParams, telemetry: Telemetry): Promise<void> => {
  const tracker = telemetry.startCommandTracking("project sample bootstrap", params);
  intro("Bootstrap a Kontent.ai project");

  const clientResult = await getAuthenticatedIapiClient(params);
  if (isErr(clientResult)) {
    tracker.fail(`auth:${clientResult.error.kind}`, { project: params.envId });
    logError(params, formatAuthError(clientResult.error));
    process.exitCode = 1;
    return;
  }
  const iapiClient = clientResult.value;
  const mapiClient = createMapiClient({ token: iapiClient.token, envId: params.envId });

  const result = await performBootstrap(params, { iapiClient, mapiClient });
  if (isErr(result)) {
    tracker.fail(bootstrapErrorCode(result.error), { project: params.envId });
    handleBootstrapError(params, result.error);
    return;
  }

  tracker.succeed({
    project: params.envId,
    subscription: result.value.subscriptionId,
    "sample-project-type": result.value.sampleProjectType,
  });
  note(`cd ${params.path}\nnpm ci\nnpm run dev`, "Next steps");
  outro("Done.");
};

const bootstrapErrorCode = (error: BootstrapError): string =>
  match(error)
    .with(
      { kind: "project-info-failed" },
      (e) => `project-info-failed:${e.sdkError.details.reason}`,
    )
    .with({ kind: "properties-failed" }, (e) => `properties-failed:${e.sdkError.details.reason}`)
    .with({ kind: "list-keys-failed" }, (e) => `list-keys-failed:${e.sdkError.details.reason}`)
    .with({ kind: "key-detail-failed" }, (e) => `key-detail-failed:${e.sdkError.details.reason}`)
    .with({ kind: "create-key-failed" }, (e) => `create-key-failed:${e.sdkError.details.reason}`)
    .otherwise((e) => e.kind);

const handleBootstrapError = (params: BootstrapParams, error: BootstrapError): void =>
  match(error)
    // soft exits: the user chose to stop or the environment is not eligible
    .with({ kind: "aborted" }, (e) => {
      outro(e.message);
    })
    .with({ kind: "unsupported-sample" }, (e) => {
      outro(
        `Bootstrap is only supported for ${supportedProjectTypes} environments. SampleProjectType is "${e.sampleValue ?? "(not set)"}".`,
      );
    })
    .otherwise((hardError) => {
      logError(params, formatBootstrapError(params, hardError));
      process.exitCode = 1;
    });

const formatBootstrapError = (
  params: BootstrapParams,
  error: Exclude<BootstrapError, { kind: "aborted" } | { kind: "unsupported-sample" }>,
): string =>
  match(error)
    .with({ kind: "target-not-usable" }, (e) => e.message)
    .with({ kind: "clone-failed" }, (e) => e.message)
    .with({ kind: "project-info-failed" }, (e) => formatIapiError(e.sdkError, params))
    .with({ kind: "properties-failed" }, (e) => formatIapiError(e.sdkError, params))
    .with({ kind: "list-keys-failed" }, (e) => formatIapiError(e.sdkError, params))
    .with({ kind: "key-detail-failed" }, (e) => formatIapiError(e.sdkError, params))
    .with({ kind: "create-key-failed" }, (e) => formatIapiError(e.sdkError, params))
    .exhaustive();
