import { openAsBlob } from "node:fs";
import { type FileHandle, open } from "node:fs/promises";
import type { Readable } from "node:stream";
import { blob } from "node:stream/consumers";
import { isatty } from "node:tty";
import type { Header, HttpMethod } from "@kontent-ai/core-sdk";
import { match } from "ts-pattern";
import { type ResolvedEnvId, resolveEnvId } from "../../core/environment/resolve.js";
import { type MapiResponse, performRawMapiRequest } from "../../core/mapi/request.js";
import { formatAuthError } from "../../lib/auth/formatAuthError.js";
import { type AuthSource, resolveMapiCredential } from "../../lib/auth/mapiCredential.js";
import { errorMessage } from "../../lib/error.js";
import { createMapiRawClient } from "../../lib/mapi/raw/client.js";
import { parseHeaders } from "../../lib/mapi/raw/headers.js";
import { parseMethod } from "../../lib/mapi/raw/method.js";
import { isNone } from "../../lib/option.js";
import { err, isErr, ok, type Result, tryAsync } from "../../lib/result.js";
import type { Telemetry } from "../../lib/telemetry/tracking.js";
import type { Logger, LogOptions } from "../../log.js";
import { presentResponse } from "./presentResponse.js";

type RequestArgs = LogOptions &
  Readonly<{
    endpoint: string;
    envId?: string | undefined;
    mapiKey?: string | undefined;
    method?: string | undefined;
    header?: ReadonlyArray<string> | undefined;
    input?: string | undefined;
    include?: boolean | undefined;
  }>;

export const runRequest = async (
  args: RequestArgs,
  logger: Logger,
  telemetry: Telemetry,
): Promise<void> => {
  const tracker = telemetry.startCommandTracking("mapi", logger);

  const resolvedEnv = await resolveEnvId(args.envId, { logger });
  if (isNone(resolvedEnv)) {
    tracker.fail("missing-env-id");
    logger.error(
      "No environment ID. Pass --envId <id>, or set a default with `kontent environment use <id>`.",
    );
    process.exitCode = 1;
    return;
  }
  const env = resolvedEnv.value;

  const prepared = await prepareRequest(args);
  if (isErr(prepared)) {
    tracker.fail(prepared.error.kind);
    logger.error(prepared.error.message);
    process.exitCode = 1;
    return;
  }

  const credential = await resolveMapiCredential(prepared.value.headers, args.mapiKey);
  if (isErr(credential)) {
    tracker.fail(`auth:${credential.error.kind}`);
    logger.error(
      credential.error.kind === "not-logged-in"
        ? "No Management API credential found. Run `kontent login`, or pass --mapiKey <key>, send an Authorization header, or set KONTENT_MAPI_KEY."
        : formatAuthError(credential.error),
    );
    process.exitCode = 1;
    return;
  }
  const { token, source } = credential.value;

  const result = await performRawMapiRequest(
    {
      ...prepared.value,
      endpoint: args.endpoint,
      envId: env.envId,
    },
    { logger, client: createMapiRawClient({ token, logger }) },
  );

  if (isErr(result)) {
    tracker.fail(result.error.kind, { "auth-source": source });
    logger.error(result.error.message);
    process.exitCode = 1;
    return;
  }

  const presented = presentResponse(result.value, args.include === true);
  if (presented.payload !== "") {
    process.stdout.write(presented.payload);
  }
  if (presented.droppedBodyWarning !== undefined) {
    logger.warning("standard", presented.droppedBodyWarning);
  }
  if (presented.payload === "" && result.value.statusCode < 400) {
    logger.info("standard", `HTTP ${result.value.statusCode} ${result.value.statusText}`);
  }

  if (result.value.statusCode >= 400) {
    tracker.fail(`http-${result.value.statusCode}`, {
      "status-code": result.value.statusCode,
      "auth-source": source,
    });
    logger.error(formatFailure(result.value, { authSource: source, env }));
    process.exitCode = 1;
    return;
  }

  tracker.succeed({ "status-code": result.value.statusCode, "auth-source": source });
};

type PreparedRequest = Readonly<{
  method: HttpMethod;
  headers: ReadonlyArray<Header>;
  body: Blob | null;
}>;

type RequestArgsError = Readonly<{
  kind: "invalid-method" | "invalid-header" | "unreadable-input";
  message: string;
}>;

const prepareRequest = async (
  args: RequestArgs,
): Promise<Result<PreparedRequest, RequestArgsError>> => {
  const method = parseMethod(args.method, args.input !== undefined);
  if (isErr(method)) {
    return err({ kind: "invalid-method", message: method.error });
  }

  // Where curl parity stops: curl does send `-X GET` with a body, we cannot - the
  // fetch spec forbids one on GET and undici throws before the request leaves.
  // Checked before the input is read: there is no point opening a file the
  // request can never carry. Only an explicit `-X GET` reaches this.
  if (args.input !== undefined && method.value === "GET") {
    return err({
      kind: "invalid-method",
      message:
        "A GET request cannot carry a body. Use -X POST, PUT or PATCH with --input, or drop --input.",
    });
  }

  const headers = parseHeaders(args.header ?? []);
  if (isErr(headers)) {
    return err({ kind: "invalid-header", message: headers.error });
  }

  const body = args.input === undefined ? ok(null) : await readInput(args.input);
  if (isErr(body)) {
    return body;
  }

  return ok({
    method: method.value,
    // The default goes first so an explicit -H Content-Type wins the merge.
    headers:
      body.value === null
        ? headers.value
        : [{ name: "Content-Type", value: "application/json" }, ...headers.value],
    body: body.value,
  });
};

const readInput = async (input: string): Promise<Result<Blob, RequestArgsError>> => {
  if (input !== "-") {
    return await readFileInput(input);
  }

  // Without this guard the command would wait forever for input nobody is piping.
  if (process.stdin.isTTY) {
    return err({
      kind: "unreadable-input",
      message: "Nothing is piped to stdin. Pipe the body in, or pass --input <file>.",
    });
  }

  return await drain(process.stdin, "stdin");
};

// A Blob has to know its length up front, so a regular file is the only source that can
// be handed to openAsBlob unread and streamed from disk at send time; everything else is
// drained into memory first. openAsBlob only stats the path it takes, reporting a missing
// one as a bare "Unable to open file as blob" and an unreadable one only once the body is
// read, with the request already out - opening the path first is what turns either into a
// real errno. openAsBlob takes a path, not a descriptor, so the probe handle is closed and
// the path is opened a second time; a swap or chmod between the two opens is accepted.
const readFileInput = async (input: string): Promise<Result<Blob, RequestArgsError>> => {
  const label = `"${input}"`;
  const toError = unreadable(label);

  const opened = await tryAsync(async () => await open(input, "r"), toError);
  if (isErr(opened)) {
    return opened;
  }
  const handle = opened.value;

  const stats = await tryAsync(async () => await handle.stat(), toError);
  if (isErr(stats)) {
    await closeQuietly(handle);
    return stats;
  }

  // A directory opens fine read-only on POSIX, so only the stat rules it out.
  if (stats.value.isDirectory()) {
    await closeQuietly(handle);
    return err({ kind: "unreadable-input", message: `Failed to read ${label}: is a directory.` });
  }

  if (isatty(handle.fd)) {
    await closeQuietly(handle);
    return err({
      kind: "unreadable-input",
      message: `Failed to read ${label}: it is a terminal, nothing will arrive.`,
    });
  }

  if (stats.value.isFile()) {
    await closeQuietly(handle);
    return await tryAsync(async () => await openAsBlob(input), toError);
  }

  // createReadStream defaults to autoClose, closing the handle on the stream's end or error.
  return await drain(handle.createReadStream(), label);
};

// A failed close cannot make the input any less readable, so it is not a result.
const closeQuietly = async (handle: FileHandle): Promise<void> =>
  await handle.close().catch(() => undefined);

const drain = async (source: Readable, label: string): Promise<Result<Blob, RequestArgsError>> =>
  await tryAsync(async () => await blob(source), unreadable(label));

const unreadable =
  (label: string) =>
  (cause: unknown): RequestArgsError => ({
    kind: "unreadable-input",
    message: `Failed to read ${label}: ${errorMessage(cause)}`,
  });

type FailureContext = Readonly<{ authSource: AuthSource; env: ResolvedEnvId }>;

const formatFailure = (response: MapiResponse, context: FailureContext): string => {
  const summary = `HTTP ${response.statusCode} ${response.statusText}`;

  return match(response.statusCode)
    .with(401, () => `${summary}\n${formatCredentialHint(context.authSource)}`)
    .with(403, () =>
      context.env.source === "stored"
        ? `${summary}\nUsed the stored default environment ${context.env.envId}. If that's the wrong one, change it with \`kontent environment use <id>\`, or pass --envId <id> for this call only.`
        : summary,
    )
    .otherwise(() => summary);
};

const formatCredentialHint = (source: AuthSource): string =>
  match(source)
    .with("header", () => "Check the Authorization header you supplied.")
    .with("mapi-key", () => "Check your Management API key.")
    .with("login", () => "Run `kontent login` to sign in again.")
    .exhaustive();
