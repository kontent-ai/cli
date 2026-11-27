import { join } from "node:path";
import type { JsonObject } from "@kontent-ai/core-sdk";
import type { AuthError } from "../../../../core/auth/types.js";
import { decideEnvId, type ResolvedEnvId } from "../../../../core/environment/envId.js";
import { mapiBaseUrl } from "../../../../core/kontentUrl/kontentUrl.js";
import { isNone, isSome, none, type Option } from "../../../../core/lib/option.js";
import { err, isErr, map, ok, partition, type Result } from "../../../../core/lib/result.js";
import { type AuthSource, decideMapiCredential } from "../../../../core/mapi/credential.js";
import { resolveMapiEndpoint } from "../../../../core/mapi/endpoint.js";
import { decideMapiNextPage } from "../../../../core/mapi/nextPage.js";
import { extractEntities } from "../../../../core/snapshot/entities.js";
import { type SnapshotKind, snapshotKinds } from "../../../../core/snapshot/kinds.js";
import { entityFolders, isEntityFile } from "../../../../core/snapshot/layout.js";
import { manifestFileName } from "../../../../core/snapshot/manifest.js";
import {
  buildSnapshotFiles,
  type FetchedKind,
  type SnapshotFilesError,
} from "../../../../core/snapshot/snapshotFiles.js";
import { decideSnapshotTarget, type SnapshotTarget } from "../../../../core/snapshot/target.js";
import {
  planSnapshotWrite,
  type SnapshotFiles,
  type WritePlan,
} from "../../../../core/snapshot/writePlan.js";
import { mapiToken } from "../../../adapters/auth/mapiToken.js";
import { type Session, session } from "../../../adapters/auth/tokenAccess.js";
import { type CliConfigStore, cliConfigStore } from "../../../adapters/config/cliConfig.js";
import { type Files, files } from "../../../adapters/files/files.js";
import {
  createRawClient,
  type RawClient,
  type RawNextPage,
} from "../../../adapters/http/rawClient.js";
import { createLoggerFromArgs, type Logger, type LogOptions } from "../../../log.js";
import type { CommandDeps } from "../../../types/yargs.js";
import {
  emitPassthroughOutput,
  usingStoredEnvironmentMessage,
} from "../../shared/passthroughOutput.js";
import { formatSnapshotOutput } from "./formatOutput.js";

export type SnapshotInput = Readonly<{
  path: string;
  baseUrl: string;
  envId?: string | undefined;
  mapiKey?: string | undefined;
  envMapiKey?: string | undefined;
}>;

export type SnapshotEffects = Readonly<{
  logger: Logger;
  config: Pick<CliConfigStore, "read">;
  session: Session;
  mapi: Pick<RawClient, "pages">;
  files: Pick<Files, "entries" | "readText" | "writeText" | "makeDir" | "removeFile">;
}>;

export type SnapshotOutcome = Readonly<{
  manifest: string;
  env: ResolvedEnvId;
  authSource: AuthSource;
  written: number;
  deleted: number;
  unchanged: number;
  omittedJsonParameters: number;
}>;

export type SnapshotError =
  | Readonly<{ kind: "missing-env-id" }>
  | Readonly<{ kind: "refused-target"; reason: "has-other-files" | "foreign-manifest" }>
  | Readonly<{ kind: "auth-failed"; error: AuthError }>
  | Readonly<{ kind: "invalid-endpoint"; message: string }>
  | Readonly<{ kind: "transport"; kindName: string; message: string; authSource: AuthSource }>
  | Readonly<{
      kind: "http-failure";
      kindName: string;
      status: number;
      authSource: AuthSource;
      env: ResolvedEnvId;
    }>
  | Readonly<{ kind: "unexpected-shape"; kindName: string }>
  | SnapshotFilesError
  | Readonly<{ kind: "files-failed"; message: string }>;

const emptySnapshot: SnapshotFiles<Option<string>> = { manifest: none, files: [] };

/**
 * Fetches the whole content model before it touches the target, then writes only what
 * changed: an unchanged environment writes nothing.
 */
export const snapshot = async (
  effects: SnapshotEffects,
  input: SnapshotInput,
): Promise<Result<SnapshotOutcome, SnapshotError>> => {
  const storedEnvId = input.envId === undefined ? (await effects.config.read()).envId : undefined;
  const env = decideEnvId({ envIdFromFlag: input.envId, storedEnvId });
  if (isNone(env)) {
    return err({ kind: "missing-env-id" });
  }
  if (env.value.source === "stored") {
    effects.logger.info("standard", usingStoredEnvironmentMessage(env.value.envId));
  }

  const target = await readTarget(effects.files, input.path);
  if (isErr(target)) {
    return target;
  }
  const decision = decideSnapshotTarget(target.value);
  if (decision.kind === "refuse") {
    return err({ kind: "refused-target", reason: decision.reason });
  }

  const credential = decideMapiCredential({
    headers: [],
    mapiKey: input.mapiKey,
    envMapiKey: input.envMapiKey,
  });
  const token = await mapiToken(credential, effects.session);
  if (isErr(token)) {
    return err({ kind: "auth-failed", error: token.error });
  }

  const request: KindRequest = {
    baseUrl: input.baseUrl,
    env: env.value,
    token: token.value,
    authSource: credential.source,
  };
  const fetched = partition(
    await Promise.all(snapshotKinds.map(async (kind) => fetchKind(effects.mapi, kind, request))),
  );
  const [fetchError] = fetched.errors;
  if (fetchError !== undefined) {
    return err(fetchError);
  }

  const next = buildSnapshotFiles(env.value.envId, fetched.values);
  if (isErr(next)) {
    return next;
  }

  const current =
    target.value.kind === "missing"
      ? ok(emptySnapshot)
      : await readCurrentFiles(effects.files, input.path, target.value);
  if (isErr(current)) {
    return current;
  }

  const plan = planSnapshotWrite(next.value, current.value);
  const applied = await applyPlan(effects.files, input.path, plan);
  if (isErr(applied)) {
    return applied;
  }

  const written = plan.writes.length + (isSome(plan.manifest) ? 1 : 0);
  return ok({
    manifest: next.value.manifest,
    env: env.value,
    authSource: credential.source,
    written,
    deleted: plan.deletes.length,
    unchanged: next.value.files.length + 1 - written,
    omittedJsonParameters: next.value.omittedJsonParameters,
  });
};

type SnapshotArgs = LogOptions &
  Readonly<{
    path: string;
    envId?: string | undefined;
    mapiKey?: string | undefined;
  }>;

export const runSnapshot = async (args: SnapshotArgs, deps: CommandDeps): Promise<void> => {
  const logger = createLoggerFromArgs(args);
  const tracker = deps.telemetry.startCommandTracking("model snapshot", logger);

  const result = await snapshot(
    { logger, config: cliConfigStore, session, mapi: createRawClient({ logger }), files },
    {
      ...args,
      baseUrl: mapiBaseUrl(deps.kontentTarget),
      envMapiKey: process.env.KONTENT_MAPI_KEY,
    },
  );

  emitPassthroughOutput(formatSnapshotOutput(result, args.path), logger, tracker);
};

const readTarget = async (
  fileAccess: SnapshotEffects["files"],
  root: string,
): Promise<Result<SnapshotTarget, SnapshotError>> => {
  const entries = await fileAccess.entries(root);
  if (isErr(entries)) {
    return err({ kind: "files-failed", message: entries.error });
  }
  if (isNone(entries.value)) {
    return ok({ kind: "missing" });
  }

  const manifestText = await fileAccess.readText(join(root, manifestFileName));
  if (isErr(manifestText)) {
    return err({ kind: "files-failed", message: manifestText.error });
  }

  return ok({ kind: "folder", entries: entries.value.value, manifestText: manifestText.value });
};

type KindRequest = Readonly<{
  baseUrl: string;
  env: ResolvedEnvId;
  token: string | undefined;
  authSource: AuthSource;
}>;

const fetchKind = async (
  mapi: SnapshotEffects["mapi"],
  kind: SnapshotKind,
  request: KindRequest,
): Promise<Result<FetchedKind, SnapshotError>> => {
  const url = resolveMapiEndpoint(kind.endpoint, {
    baseUrl: request.baseUrl,
    envId: request.env.envId,
  });
  if (isErr(url)) {
    return err({ kind: "invalid-endpoint", message: url.error.message });
  }

  const pages = mapi.pages(
    { url: url.value, method: "GET", headers: [], body: null },
    request.token,
    { maxPages: undefined, nextPage: (page) => toRawNextPage(decideMapiNextPage(page.payload)) },
  );

  const entities: JsonObject[] = [];
  for await (const page of pages) {
    if (isErr(page)) {
      return err({
        kind: "transport",
        kindName: kind.name,
        message: page.error,
        authSource: request.authSource,
      });
    }
    if (page.value.status >= 400) {
      return err({
        kind: "http-failure",
        kindName: kind.name,
        status: page.value.status,
        authSource: request.authSource,
        env: request.env,
      });
    }
    const extracted = extractEntities(kind.response, page.value.payload);
    if (isErr(extracted)) {
      return err({ kind: "unexpected-shape", kindName: kind.name });
    }
    entities.push(...extracted.value);
  }

  return ok({ kind, entities });
};

const toRawNextPage = (token: Option<string>): RawNextPage =>
  isSome(token) ? { continuationToken: token.value } : {};

const readCurrentFiles = async (
  fileAccess: SnapshotEffects["files"],
  root: string,
  target: Extract<SnapshotTarget, { kind: "folder" }>,
): Promise<Result<SnapshotFiles<Option<string>>, SnapshotError>> => {
  const listings = partition(
    await Promise.all(
      entityFolders
        .filter((folder) => target.entries.includes(folder))
        .map(async (folder) =>
          map(await fileAccess.entries(join(root, folder)), (names) =>
            isSome(names) ? names.value.map((name) => [folder, name]) : [],
          ),
        ),
    ),
  );
  const [listingError] = listings.errors;
  if (listingError !== undefined) {
    return err({ kind: "files-failed", message: listingError });
  }

  const paths = [...target.entries.map((name) => [name]), ...listings.values.flat()].filter(
    isEntityFile,
  );
  const texts = partition(
    await Promise.all(
      paths.map(async (path) =>
        map(await fileAccess.readText(join(root, ...path)), (text) => ({ path, text })),
      ),
    ),
  );
  const [readError] = texts.errors;
  if (readError !== undefined) {
    return err({ kind: "files-failed", message: readError });
  }

  return ok({
    manifest: target.manifestText,
    files: texts.values.flatMap(({ path, text }) =>
      isSome(text) ? [{ path, text: text.value }] : [],
    ),
  });
};

const applyPlan = async (
  fileAccess: SnapshotEffects["files"],
  root: string,
  plan: WritePlan,
): Promise<Result<void, SnapshotError>> => {
  if (isSome(plan.manifest)) {
    const madeRoot = await fileAccess.makeDir(root);
    const wroteManifest = isErr(madeRoot)
      ? madeRoot
      : await fileAccess.writeText(join(root, manifestFileName), plan.manifest.value);
    if (isErr(wroteManifest)) {
      return err({ kind: "files-failed", message: wroteManifest.error });
    }
  }

  const folders = [...new Set(plan.writes.map((file) => join(root, ...file.path.slice(0, -1))))];
  const made = partition(await Promise.all(folders.map(async (dir) => fileAccess.makeDir(dir))));
  const [madeError] = made.errors;
  if (madeError !== undefined) {
    return err({ kind: "files-failed", message: madeError });
  }

  const changed = partition(
    await Promise.all([
      ...plan.writes.map(async (file) => fileAccess.writeText(join(root, ...file.path), file.text)),
      ...plan.deletes.map(async (path) => fileAccess.removeFile(join(root, ...path))),
    ]),
  );
  const [changeError] = changed.errors;
  if (changeError !== undefined) {
    return err({ kind: "files-failed", message: changeError });
  }

  return ok(undefined);
};
