import path from "node:path";
import type { KontentSdkError } from "@kontent-ai/core-sdk";
import { match, P } from "ts-pattern";
import { mapiBaseUrl } from "../../../../../core/kontentUrl/kontentUrl.js";
import { isNone } from "../../../../../core/lib/option.js";
import { err, isErr, ok, type Result } from "../../../../../core/lib/result.js";
import { planDeliveryKeyRequest } from "../../../../../core/project/deliveryKeyRequest.js";
import { applyEnvOverrides } from "../../../../../core/project/envFile.js";
import { PREVIEW_PORT } from "../../../../../core/project/previewSpace.js";
import {
  buildEnvValues,
  findSample,
  type PreviewSpaceConfig,
  type SampleApp,
  supportedProjectTypes,
} from "../../../../../core/project/samples.js";
import { getAuthenticatedIapiClient } from "../../../../adapters/auth/authenticatedClient.js";
import { type Clock, systemClock } from "../../../../adapters/clock/clock.js";
import { type Files, files } from "../../../../adapters/files/files.js";
import {
  createDeliveryKeys,
  type DeliveryKeySummary,
  type DeliveryKeys,
} from "../../../../adapters/iapi/deliveryKeys.js";
import { formatIapiError, iapiHttpStatus } from "../../../../adapters/iapi/formatIapiError.js";
import { createProjects, type Projects } from "../../../../adapters/iapi/projects.js";
import { createMapiClient } from "../../../../adapters/mapi/client.js";
import {
  createPreviewConfigurationStore,
  type PreviewConfigurationStore,
} from "../../../../adapters/mapi/previewConfiguration.js";
import { createSpaces, type Spaces } from "../../../../adapters/mapi/spaces.js";
import { type Prompts, prompts } from "../../../../adapters/prompts/prompts.js";
import { type Templates, templates } from "../../../../adapters/templates/templates.js";
import { createLoggerFromArgs, type Logger, type LogOptions } from "../../../../log.js";
import type { CommandDeps } from "../../../../types/yargs.js";
import { noEnvironmentAccessMessage } from "../../../shared/environmentAccess.js";
import { formatAuthError } from "../../../shared/formatAuthError.js";
import { sessionExpiredMessage } from "../../../shared/sessionExpired.js";
import { ensureLocalhostSpace, type SpaceSetupError } from "./space.js";

type BootstrapParams = Readonly<{
  envId: string;
  path: string;
}>;

export type BootstrapEffects = Readonly<{
  logger: Logger;
  clock: Clock;
  prompts: Pick<Prompts, "spinner" | "confirm" | "select" | "note">;
  files: Files;
  projects: Projects;
  deliveryKeys: DeliveryKeys;
  templates: Templates;
  spaces: Spaces;
  previewConfiguration: PreviewConfigurationStore;
}>;

type BootstrapSuccess = Readonly<{
  subscriptionId: string;
  sampleProjectType: string | undefined;
}>;

type BootstrapError =
  | { readonly kind: "target-not-usable"; readonly message: string }
  | { readonly kind: "project-info-failed"; readonly sdkError: KontentSdkError }
  | { readonly kind: "properties-failed"; readonly sdkError: KontentSdkError }
  | { readonly kind: "unsupported-sample"; readonly sampleValue: string | undefined }
  | { readonly kind: "aborted"; readonly message: string }
  | { readonly kind: "list-keys-failed"; readonly sdkError: KontentSdkError }
  | { readonly kind: "key-detail-failed"; readonly sdkError: KontentSdkError }
  | { readonly kind: "create-key-failed"; readonly sdkError: KontentSdkError }
  | { readonly kind: "clone-failed"; readonly message: string };

export const bootstrap = async (
  effects: BootstrapEffects,
  params: BootstrapParams,
): Promise<Result<BootstrapSuccess, BootstrapError>> => {
  const target = await ensureEmptyTargetDirectory(effects, params.path);
  if (isErr(target)) {
    return target;
  }

  const inspectSpinner = effects.prompts.spinner();
  inspectSpinner.start("Inspecting environment");
  const project = await effects.projects.info(params.envId);
  if (isErr(project)) {
    inspectSpinner.error("Failed to fetch project info");
    return err({ kind: "project-info-failed", sdkError: project.error });
  }
  const { projectContainerId, projectName, subscriptionId } = project.value;

  const properties = await effects.projects.properties(params.envId);
  if (isErr(properties)) {
    inspectSpinner.error("Failed to fetch project properties");
    return err({ kind: "properties-failed", sdkError: properties.error });
  }
  inspectSpinner.stop(`Environment "${projectName}"`);

  const sampleValue = properties.value.find((p) => p.key === "SampleProjectType")?.value;
  const sample = findSample(sampleValue);
  if (sample === undefined) {
    return err({ kind: "unsupported-sample", sampleValue });
  }

  const deliveryKey = await resolveDeliveryKey(effects, projectContainerId, params.envId);
  if (isErr(deliveryKey)) {
    return deliveryKey;
  }

  const cloneSpinner = effects.prompts.spinner();
  cloneSpinner.start(`Cloning ${sample.templateRepo}`);
  const cloned = await effects.templates.download(sample.templateRepo, params.path);
  if (isErr(cloned)) {
    cloneSpinner.error("Clone failed");
    return err({ kind: "clone-failed", message: cloned.error });
  }
  cloneSpinner.stop(`Cloned into ${params.path}`);

  await wireEnvFile(effects, params, sample, deliveryKey.value);

  if (sample.previewSpace) {
    await setupLocalhostSpace(effects, sample.previewSpace);
  }

  return ok({ subscriptionId, sampleProjectType: sampleValue });
};

export const runBootstrap = async (
  args: LogOptions & BootstrapParams,
  deps: CommandDeps,
): Promise<void> => {
  const logger = createLoggerFromArgs(args);
  const tracker = deps.telemetry.startCommandTracking("project sample bootstrap", logger);
  prompts.intro("Bootstrap a Kontent.ai project");

  const clientResult = await getAuthenticatedIapiClient(logger, deps.kontentTarget);
  if (isErr(clientResult)) {
    tracker.fail(`auth:${clientResult.error.kind}`, { project: args.envId });
    logger.error(formatAuthError(clientResult.error));
    process.exitCode = 1;
    return;
  }
  const iapiClient = clientResult.value;
  const mapiClient = createMapiClient({
    token: iapiClient.token,
    envId: args.envId,
    baseUrl: mapiBaseUrl(deps.kontentTarget),
  });

  const result = await bootstrap(
    {
      logger,
      clock: systemClock,
      prompts,
      files,
      projects: createProjects(iapiClient),
      deliveryKeys: createDeliveryKeys(iapiClient),
      templates,
      spaces: createSpaces(mapiClient),
      previewConfiguration: createPreviewConfigurationStore(mapiClient),
    },
    args,
  );
  if (isErr(result)) {
    tracker.fail(bootstrapErrorCode(result.error), { project: args.envId });
    handleBootstrapError(args, logger, result.error);
    return;
  }

  tracker.succeed({
    project: args.envId,
    subscription: result.value.subscriptionId,
    "sample-project-type": result.value.sampleProjectType,
  });
  prompts.note(`cd ${args.path}\nnpm ci\nnpm run dev:https`, "Next steps");
  prompts.outro("Done.");
};

// A missing directory counts as empty: the clone creates it.
const ensureEmptyTargetDirectory = async (
  effects: BootstrapEffects,
  target: string,
): Promise<Result<void, BootstrapError>> => {
  const entries = await effects.files.entries(target);
  if (isErr(entries)) {
    return err({
      kind: "target-not-usable",
      message: `Cannot access target path "${target}": ${entries.error}`,
    });
  }
  if (!isNone(entries.value) && entries.value.value.length > 0) {
    return err({
      kind: "target-not-usable",
      message: `Target path "${target}" is not empty. Choose a fresh directory.`,
    });
  }
  return ok(undefined);
};

const CREATE_NEW_KEY_VALUE = "__create_new_delivery_key__";

const resolveDeliveryKey = async (
  effects: BootstrapEffects,
  containerId: string,
  envId: string,
): Promise<Result<string, BootstrapError>> => {
  const listSpinner = effects.prompts.spinner();
  listSpinner.start("Loading delivery API keys");
  const listed = await effects.deliveryKeys.list(containerId, envId);
  if (isErr(listed)) {
    listSpinner.error("Failed to list API keys");
    return err({ kind: "list-keys-failed", sdkError: listed.error });
  }

  const existing = listed.value;
  listSpinner.stop(
    existing.length === 0
      ? "No delivery API key found"
      : `Found ${existing.length} delivery API key${existing.length === 1 ? "" : "s"}`,
  );

  if (existing.length === 0) {
    const wantsNew = await effects.prompts.confirm({
      message: "Create a new delivery API key for this environment?",
      initialValue: true,
    });
    if (isNone(wantsNew) || !wantsNew.value) {
      return err({
        kind: "aborted",
        message: "Aborted: a delivery API key is required to bootstrap.",
      });
    }
    return createKeyAndReturnSecret(effects, containerId, envId);
  }

  const choice = await effects.prompts.select({
    message: "Select a delivery API key for the new app:",
    options: [
      ...existing.map((key) => ({ value: key.tokenSeedId, label: formatKeyOption(key) })),
      { value: CREATE_NEW_KEY_VALUE, label: "+ Create new delivery key" },
    ],
  });
  if (isNone(choice)) {
    return err({ kind: "aborted", message: "Aborted: no delivery API key selected." });
  }

  if (choice.value === CREATE_NEW_KEY_VALUE) {
    return createKeyAndReturnSecret(effects, containerId, envId);
  }

  const detailSpinner = effects.prompts.spinner();
  detailSpinner.start("Fetching API key");
  const apiKey = await effects.deliveryKeys.viewApiKey(containerId, choice.value);
  if (isErr(apiKey)) {
    detailSpinner.error("Failed to fetch API key");
    return err({ kind: "key-detail-failed", sdkError: apiKey.error });
  }
  detailSpinner.stop("API key ready");
  return ok(apiKey.value);
};

const formatKeyOption = (key: DeliveryKeySummary): string =>
  `${key.name}  (${key.tokenSeedId.slice(0, 8)}…, expires ${key.expiresAt.slice(0, 10)})`;

const createKeyAndReturnSecret = async (
  effects: BootstrapEffects,
  containerId: string,
  envId: string,
): Promise<Result<string, BootstrapError>> => {
  const createSpinner = effects.prompts.spinner();
  createSpinner.start("Creating delivery API key");
  const created = await effects.deliveryKeys.create(
    containerId,
    planDeliveryKeyRequest(envId, effects.clock.now()),
  );
  if (isErr(created)) {
    createSpinner.error("Failed to create delivery API key");
    return err({ kind: "create-key-failed", sdkError: created.error });
  }
  createSpinner.stop(`Created delivery API key "${created.value.name}"`);
  return ok(created.value.apiKey);
};

const ENV_OUTPUT_FILE = ".env.local";

const wireEnvFile = async (
  effects: BootstrapEffects,
  params: BootstrapParams,
  sample: SampleApp,
  deliveryKey: string,
): Promise<void> => {
  const envSpinner = effects.prompts.spinner();
  envSpinner.start(`Writing ${ENV_OUTPUT_FILE}`);

  const template = await effects.files.readText(path.join(params.path, sample.envTemplateFile));
  if (isErr(template)) {
    envSpinner.error(`Failed to read ${sample.envTemplateFile}`);
    effects.logger.error(template.error);
    return;
  }
  if (isNone(template.value)) {
    envSpinner.stop(
      `${sample.envTemplateFile} not found in template; skipping ${ENV_OUTPUT_FILE} wiring`,
    );
    return;
  }

  const written = await effects.files.writeText(
    path.join(params.path, ENV_OUTPUT_FILE),
    applyEnvOverrides(template.value.value, buildEnvValues(sample, params.envId, deliveryKey)),
  );
  if (isErr(written)) {
    envSpinner.error(`Failed to write ${ENV_OUTPUT_FILE}`);
    effects.logger.error(written.error);
    return;
  }
  envSpinner.stop(`Wrote ${ENV_OUTPUT_FILE}`);
};

const setupLocalhostSpace = async (
  effects: BootstrapEffects,
  previewSpace: PreviewSpaceConfig,
): Promise<void> => {
  const spaceSpinner = effects.prompts.spinner();
  spaceSpinner.start("Setting up localhost preview space");
  const result = await ensureLocalhostSpace(effects, previewSpace);

  if (isErr(result)) {
    spaceSpinner.error("Could not set up the localhost preview space");
    effects.logger.warning("standard", spaceWarning(result.error));
    return;
  }

  spaceSpinner.stop('Space "localhost" ready');
  effects.prompts.note(
    result.value.kind === "added"
      ? `Preview URL set to ${result.value.domain}. Your app is expected on port ${PREVIEW_PORT}; if you run it on a different port, change the preview URL in the Kontent.ai app (Environment settings → Preview URLs).`
      : `The "localhost" space already has a preview URL (${result.value.domain}); leaving it as is.`,
    "Preview space ready",
  );
};

const spaceWarning = (error: SpaceSetupError): string =>
  error.kind === "preview-failed"
    ? `The "localhost" space is ready, but its preview URL could not be set to localhost:${PREVIEW_PORT}.\n${error.message}\nSet it manually in the Kontent.ai app (Environment settings → Preview URLs). Re-running bootstrap will retry.`
    : `Could not create the "localhost" preview space.\n${error.message}\nAdd it manually in the Kontent.ai app (Environment settings → Spaces).`;

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

const handleBootstrapError = (
  params: BootstrapParams,
  logger: Logger,
  error: BootstrapError,
): void =>
  match(error)
    // soft exits: the user chose to stop or the environment is not eligible
    .with({ kind: "aborted" }, (e) => {
      prompts.outro(e.message);
    })
    .with({ kind: "unsupported-sample" }, (e) => {
      prompts.outro(
        `Bootstrap is only supported for ${supportedProjectTypes} environments. SampleProjectType is "${e.sampleValue ?? "(not set)"}".`,
      );
    })
    .otherwise((hardError) => {
      logger.error(formatBootstrapError(params, logger, hardError));
      process.exitCode = 1;
    });

const formatBootstrapError = (
  params: BootstrapParams,
  logger: Logger,
  error: Exclude<BootstrapError, { kind: "aborted" } | { kind: "unsupported-sample" }>,
): string =>
  match(error)
    .with({ kind: "target-not-usable" }, (e) => e.message)
    .with({ kind: "clone-failed" }, (e) => e.message)
    .with(
      {
        kind: P.union(
          "project-info-failed",
          "properties-failed",
          "list-keys-failed",
          "key-detail-failed",
          "create-key-failed",
        ),
      },
      (e) => formatIapiFailure(e.sdkError, params.envId, logger.isVerbose),
    )
    .exhaustive();

const formatIapiFailure = (error: KontentSdkError, envId: string, isVerbose: boolean): string =>
  match(iapiHttpStatus(error))
    .with(401, () => sessionExpiredMessage)
    .with(403, () => noEnvironmentAccessMessage(envId))
    .otherwise(() => formatIapiError(error, { isVerbose }));
