import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { isCancel } from "@clack/prompts";
import type { KontentSdkError } from "@kontent-ai/core-sdk";
import { downloadTemplate } from "giget";
import { applyEnvOverrides } from "../../lib/envFile.js";
import { errorMessage } from "../../lib/error.js";
import type { IapiClient } from "../../lib/iapi/client.js";
import { createDeliveryApiKey } from "../../lib/iapi/endpoints/createDeliveryApiKey.js";
import { getApiKeyDetail } from "../../lib/iapi/endpoints/getApiKeyDetail.js";
import { getProjectInfo } from "../../lib/iapi/endpoints/getProjectInfo.js";
import { type ApiKeyListingItem, listApiKeys } from "../../lib/iapi/endpoints/listApiKeys.js";
import { listProjectProperties } from "../../lib/iapi/endpoints/listProjectProperties.js";
import type { MapiClient } from "../../lib/mapi/client.js";
import { err, isErr, ok, type Result } from "../../lib/result.js";
import { confirm, note, select, spinner } from "../../lib/ui/prompts.js";
import type { Logger } from "../../log.js";
import { buildEnvValues, findSample, type PreviewSpaceConfig, type SampleApp } from "./samples.js";
import { ensureLocalhostSpace, PREVIEW_PORT, type SpaceSetupError } from "./space.js";

export type BootstrapParams = Readonly<{
  envId: string;
  path: string;
}>;

export type BootstrapDeps = Readonly<{
  logger: Logger;
  iapiClient: IapiClient;
  mapiClient: MapiClient;
}>;

export type BootstrapSuccess = Readonly<{
  subscriptionId: string;
  sampleProjectType: string | undefined;
}>;

export type BootstrapError =
  | { readonly kind: "target-not-usable"; readonly message: string }
  | { readonly kind: "project-info-failed"; readonly sdkError: KontentSdkError }
  | { readonly kind: "properties-failed"; readonly sdkError: KontentSdkError }
  | { readonly kind: "unsupported-sample"; readonly sampleValue: string | undefined }
  | { readonly kind: "aborted"; readonly message: string }
  | { readonly kind: "list-keys-failed"; readonly sdkError: KontentSdkError }
  | { readonly kind: "key-detail-failed"; readonly sdkError: KontentSdkError }
  | { readonly kind: "create-key-failed"; readonly sdkError: KontentSdkError }
  | { readonly kind: "clone-failed"; readonly message: string };

const ENV_OUTPUT_FILE = ".env.local";
const CREATE_NEW_KEY_VALUE = "__create_new_delivery_key__";

export const performBootstrap = async (
  params: BootstrapParams,
  deps: BootstrapDeps,
): Promise<Result<BootstrapSuccess, BootstrapError>> => {
  const { logger, iapiClient, mapiClient } = deps;

  const targetCheck = await ensureTargetUsable(params.path);
  if (targetCheck.kind === "err") {
    return err({ kind: "target-not-usable", message: targetCheck.error });
  }

  const inspectSpinner = spinner();
  inspectSpinner.start("Inspecting environment");
  const projectResult = await getProjectInfo(iapiClient, params.envId).fetchSafe();
  if (!projectResult.success) {
    inspectSpinner.error("Failed to fetch project info");
    return err({ kind: "project-info-failed", sdkError: projectResult.error });
  }
  const { projectContainerId, projectName, subscriptionId } = projectResult.response.payload;

  const propertiesResult = await listProjectProperties(iapiClient, params.envId).fetchSafe();
  if (!propertiesResult.success) {
    inspectSpinner.error("Failed to fetch project properties");
    return err({ kind: "properties-failed", sdkError: propertiesResult.error });
  }
  inspectSpinner.stop(`Environment "${projectName}"`);

  const sampleProperty = propertiesResult.response.payload.find(
    (p) => p.key === "SampleProjectType",
  );
  const sampleValue = sampleProperty?.value;
  const sample = findSample(sampleValue);
  if (sample === undefined) {
    return err({ kind: "unsupported-sample", sampleValue });
  }

  const keyResolution = await resolveDeliveryKey(iapiClient, projectContainerId, params.envId);
  if (isErr(keyResolution)) {
    return keyResolution;
  }
  const deliveryKey = keyResolution.value;

  const cloneSpinner = spinner();
  cloneSpinner.start(`Cloning ${sample.templateRepo}`);
  try {
    await downloadTemplate(sample.templateRepo, { dir: params.path, force: false });
  } catch (cause) {
    cloneSpinner.error("Clone failed");
    return err({ kind: "clone-failed", message: errorMessage(cause) });
  }
  cloneSpinner.stop(`Cloned into ${params.path}`);

  await wireEnvFile(params, logger, sample, deliveryKey);

  if (sample.previewSpace) {
    await setupLocalhostSpace(logger, mapiClient, sample.previewSpace);
  }

  return ok({ subscriptionId, sampleProjectType: sampleValue });
};

const setupLocalhostSpace = async (
  logger: Logger,
  mapiClient: MapiClient,
  previewSpace: PreviewSpaceConfig,
): Promise<void> => {
  const spaceSpinner = spinner();
  spaceSpinner.start("Setting up localhost preview space");
  const result = await ensureLocalhostSpace(mapiClient, previewSpace);

  if (isErr(result)) {
    spaceSpinner.error("Could not set up the localhost preview space");
    logger.warning("standard", spaceWarning(result.error));
    return;
  }

  spaceSpinner.stop('Space "localhost" ready');
  note(
    result.value.wasSet
      ? `Preview URL set to ${result.value.previewDomain}. Your app is expected on port ${PREVIEW_PORT}; if you run it on a different port, change the preview URL in the Kontent.ai app (Environment settings → Preview URLs).`
      : `The "localhost" space already has a preview URL (${result.value.previewDomain}); leaving it as is.`,
    "Preview space ready",
  );
};

const spaceWarning = (error: SpaceSetupError): string =>
  error.kind === "preview-failed"
    ? `The "localhost" space is ready, but its preview URL could not be set to localhost:${PREVIEW_PORT}.\n${error.message}\nSet it manually in the Kontent.ai app (Environment settings → Preview URLs). Re-running bootstrap will retry.`
    : `Could not create the "localhost" preview space.\n${error.message}\nAdd it manually in the Kontent.ai app (Environment settings → Spaces).`;

const resolveDeliveryKey = async (
  client: IapiClient,
  containerId: string,
  envId: string,
): Promise<Result<string, BootstrapError>> => {
  const listSpinner = spinner();
  listSpinner.start("Loading delivery API keys");
  const listResult = await listApiKeys(client, containerId, {
    apiKeyTypes: ["delivery-api"],
    environments: [envId],
  }).executeSafe();

  if (!listResult.success) {
    listSpinner.error("Failed to list API keys");
    return err({ kind: "list-keys-failed", sdkError: listResult.error });
  }

  const existing = listResult.response.payload;
  listSpinner.stop(
    existing.length === 0
      ? "No delivery API key found"
      : `Found ${existing.length} delivery API key${existing.length === 1 ? "" : "s"}`,
  );

  if (existing.length === 0) {
    const wantsNew = await confirm({
      message: "Create a new delivery API key for this environment?",
      initialValue: true,
    });
    if (isCancel(wantsNew) || !wantsNew) {
      return err({
        kind: "aborted",
        message: "Aborted: a delivery API key is required to bootstrap.",
      });
    }
    return createKeyAndReturnSecret(client, containerId, envId);
  }

  const choice = await select<string>({
    message: "Select a delivery API key for the new app:",
    options: [
      ...existing.map((k) => ({ value: k.token_seed_id, label: formatKeyOption(k) })),
      { value: CREATE_NEW_KEY_VALUE, label: "+ Create new delivery key" },
    ],
  });
  if (isCancel(choice)) {
    return err({ kind: "aborted", message: "Aborted: no delivery API key selected." });
  }

  if (choice === CREATE_NEW_KEY_VALUE) {
    return createKeyAndReturnSecret(client, containerId, envId);
  }

  const detailSpinner = spinner();
  detailSpinner.start("Fetching API key");
  const detail = await getApiKeyDetail(client, containerId, choice).fetchSafe();
  if (!detail.success) {
    detailSpinner.error("Failed to fetch API key");
    return err({ kind: "key-detail-failed", sdkError: detail.error });
  }
  detailSpinner.stop("API key ready");
  return ok(detail.response.payload.api_key);
};

const createKeyAndReturnSecret = async (
  client: IapiClient,
  containerId: string,
  envId: string,
): Promise<Result<string, BootstrapError>> => {
  const now = new Date();
  const expiresAt = new Date(now);
  expiresAt.setUTCFullYear(expiresAt.getUTCFullYear() + 1);
  const createdDate = now.toISOString().slice(0, 10);
  const createSpinner = spinner();
  createSpinner.start("Creating delivery API key");
  const created = await createDeliveryApiKey(client, containerId, {
    name: `Delivery key — CLI bootstrap (${createdDate})`,
    environments: [envId],
    hasPreviewDeliveryAccess: true,
    expiresAt,
  }).executeSafe();
  if (!created.success) {
    createSpinner.error("Failed to create delivery API key");
    return err({ kind: "create-key-failed", sdkError: created.error });
  }
  createSpinner.stop(`Created delivery API key "${created.response.payload.name}"`);
  return ok(created.response.payload.api_key);
};

const formatKeyOption = (k: ApiKeyListingItem): string =>
  `${k.name}  (${k.token_seed_id.slice(0, 8)}…, expires ${k.expires_at.slice(0, 10)})`;

const ensureTargetUsable = async (
  target: string,
): Promise<{ kind: "ok" } | { kind: "err"; error: string }> => {
  try {
    const entries = await readdir(target);
    if (entries.length === 0) {
      return { kind: "ok" };
    }
    return {
      kind: "err",
      error: `Target path "${target}" is not empty. Choose a fresh directory.`,
    };
  } catch (cause) {
    if (isNoEnt(cause)) {
      return { kind: "ok" };
    }
    return {
      kind: "err",
      error: `Cannot access target path "${target}": ${errorMessage(cause)}`,
    };
  }
};

const wireEnvFile = async (
  params: BootstrapParams,
  logger: Logger,
  sample: SampleApp,
  deliveryKey: string,
): Promise<void> => {
  const templatePath = path.join(params.path, sample.envTemplateFile);
  const envPath = path.join(params.path, ENV_OUTPUT_FILE);
  const envSpinner = spinner();
  envSpinner.start(`Writing ${ENV_OUTPUT_FILE}`);

  let template: string;
  try {
    template = await readFile(templatePath, "utf8");
  } catch (cause) {
    if (isNoEnt(cause)) {
      envSpinner.stop(
        `${sample.envTemplateFile} not found in template; skipping ${ENV_OUTPUT_FILE} wiring`,
      );
      return;
    }
    envSpinner.error(`Failed to read ${sample.envTemplateFile}`);
    logger.error(errorMessage(cause));
    return;
  }

  const next = applyEnvOverrides(template, buildEnvValues(sample, params.envId, deliveryKey));

  try {
    await writeFile(envPath, next, "utf8");
    envSpinner.stop(`Wrote ${ENV_OUTPUT_FILE}`);
  } catch (cause) {
    envSpinner.error(`Failed to write ${ENV_OUTPUT_FILE}`);
    logger.error(errorMessage(cause));
  }
};

const isNoEnt = (cause: unknown): boolean =>
  typeof cause === "object" && cause !== null && "code" in cause && cause.code === "ENOENT";
