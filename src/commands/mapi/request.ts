import { readFile } from "node:fs/promises";
import type { Header, HttpMethod } from "@kontent-ai/core-sdk";
import { match } from "ts-pattern";
import { type MapiResponse, performRawMapiRequest } from "../../core/mapi/request.js";
import { formatAuthError } from "../../lib/auth/formatAuthError.js";
import { type AuthSource, resolveMapiCredential } from "../../lib/auth/mapiCredential.js";
import { createMapiRawClient } from "../../lib/mapi/raw/client.js";
import { isJsonContentType } from "../../lib/mapi/raw/contentType.js";
import { parseHeaders } from "../../lib/mapi/raw/headers.js";
import { parseMethod } from "../../lib/mapi/raw/method.js";
import { err, isErr, ok, type Result, tryAsync } from "../../lib/result.js";
import type { Telemetry } from "../../lib/telemetry/tracking.js";
import { createLoggerFromArgs, type Logger, type LogOptions } from "../../log.js";
import type { RegisterCommand } from "../../types/yargs.js";

type RequestArgs = LogOptions &
  Readonly<{
    endpoint: string;
    envId: string;
    mapiKey?: string | undefined;
    method?: string | undefined;
    header?: ReadonlyArray<string> | undefined;
    input?: string | undefined;
    include?: boolean | undefined;
  }>;

export const register: RegisterCommand = (sub, deps) =>
  sub.command({
    command: "$0 <endpoint>",
    describe: "Send an authenticated request to the Management API",
    builder: (b) =>
      b
        // `<endpoint>` only makes it required at runtime; demandOption narrows the type.
        .positional("endpoint", {
          type: "string",
          demandOption: true,
          describe: 'API path, e.g. "types" or "projects/{environment_id}/types"',
        })
        .option("envId", {
          type: "string",
          demandOption: true,
          describe: "Environment ID (Guid)",
        })
        .option("mapiKey", {
          type: "string",
          describe:
            "Management API key. Falls back to the KONTENT_MAPI_KEY environment variable, then to the logged-in user's token",
        })
        .option("method", {
          type: "string",
          alias: "X",
          describe: "HTTP method. (default: GET, or POST with --input)",
        })
        .option("header", {
          type: "string",
          array: true,
          alias: "H",
          describe:
            'Request header in the "Name: value" format. Repeatable. An Authorization header takes precedence over --mapiKey and the stored login token',
        })
        // Without nargs the array is greedy, so `-H 'X-Foo: 1' types` swallows the
        // endpoint and yargs then reports it as a missing positional.
        .nargs("header", 1)
        .option("input", {
          type: "string",
          describe:
            'File with the request body, or "-" to read stdin. Sent as application/json unless a Content-Type header says otherwise - set one when uploading a binary file, since the Management API stores it as the asset\'s MIME type',
        })
        // Without nargs, yargs-parser reads the lone "-" of `--input -` as a
        // positional and .strict() then rejects it as an unknown argument.
        .nargs("input", 1)
        .option("include", {
          type: "boolean",
          alias: "i",
          default: false,
          describe: "Print the status line and response headers before the body",
        })
        // A query string needs quoting: "?" is a glob character in zsh and bash.
        .example("$0 mapi 'types?limit=10' --envId <id>", "List the first 10 content types")
        .example(
          "$0 mapi types --envId <id> --input body.json",
          "Create a content type from a file (--input implies POST)",
        )
        .example("$0 mapi 'items/<item-id>' -X DELETE --envId <id>", "Delete a content item")
        .example(
          "$0 mapi types -H 'X-Foo: 1' -H 'X-Bar: 2' --envId <id>",
          "Send extra headers (-H is repeatable)",
        )
        .example(
          'echo \'{"name":"Article"}\' | $0 mapi types --envId <id> --input -',
          "Create a content type from a piped body",
        ),
    handler: async (args) => runRequest(args, createLoggerFromArgs(args), deps.telemetry),
  });

const runRequest = async (
  args: RequestArgs,
  logger: Logger,
  telemetry: Telemetry,
): Promise<void> => {
  const tracker = telemetry.startCommandTracking("mapi", logger);

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
    logger.error(formatAuthError(credential.error));
    process.exitCode = 1;
    return;
  }
  const { token, source } = credential.value;

  const controller = new AbortController();
  const abortRequest = () => controller.abort();
  process.once("SIGINT", abortRequest);

  const result = await performRawMapiRequest(
    {
      ...prepared.value,
      endpoint: args.endpoint,
      envId: args.envId,
      abortSignal: controller.signal,
    },
    { logger, client: createMapiRawClient({ token }) },
  );
  process.off("SIGINT", abortRequest);

  if (isErr(result)) {
    tracker.fail(result.error.kind, { "auth-source": source });
    logger.error(result.error.message);
    process.exitCode = 1;
    return;
  }

  writeResponse(result.value, args.include === true, logger);

  if (result.value.statusCode >= 400) {
    tracker.fail(`http-${result.value.statusCode}`, {
      "status-code": result.value.statusCode,
      "auth-source": source,
    });
    logger.error(formatFailure(result.value, source));
    process.exitCode = 1;
    return;
  }

  tracker.succeed({ "status-code": result.value.statusCode, "auth-source": source });
};

type PreparedRequest = Readonly<{
  method: HttpMethod;
  headers: ReadonlyArray<Header>;
  body: string | Blob | null;
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
    return await tryAsync(
      async () => new Blob([await readFile(input)]),
      (cause) => ({
        kind: "unreadable-input" as const,
        message: `Failed to read "${input}": ${describeCause(cause)}`,
      }),
    );
  }

  // Without this guard the command would wait forever for input nobody is piping.
  if (process.stdin.isTTY) {
    return err({
      kind: "unreadable-input",
      message: "Nothing is piped to stdin. Pipe the body in, or pass --input <file>.",
    });
  }

  return await tryAsync(
    async () => new Blob([await readStdin()]),
    (cause) => ({
      kind: "unreadable-input" as const,
      message: `Failed to read stdin: ${describeCause(cause)}`,
    }),
  );
};

const readStdin = async (): Promise<Buffer> => {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
};

/**
 * A body of a type core-sdk skipped never reached this point, so the content type
 * is the only trace left that there was one - report it on stderr rather than
 * leave stdout silently empty. Not the content length: a chunked response sends
 * none, and the body would then vanish without a word.
 */
const writeResponse = (
  response: MapiResponse,
  shouldIncludeHeaders: boolean,
  logger: Logger,
): void => {
  if (shouldIncludeHeaders) {
    const headerLines = response.headers.map((header) => `${header.name}: ${header.value}`);
    process.stdout.write(
      [`HTTP/1.1 ${response.statusCode} ${response.statusText}`, ...headerLines, "", ""].join("\n"),
    );
  }

  if (isJsonContentType(rawContentType(response))) {
    process.stdout.write(`${JSON.stringify(response.body, null, 2)}\n`);
    return;
  }

  // A response that carried nothing at all - a 204, say - sends no content type
  // either, and there is nothing to report.
  const mediaType = contentType(response);
  if (mediaType === undefined) {
    return;
  }

  const droppedBytes = contentLength(response);
  const carried =
    droppedBytes === undefined ? `a ${mediaType} body` : `${droppedBytes} bytes of ${mediaType}`;
  logger.warning(
    "standard",
    `The response carried ${carried}, which is not JSON and was not shown.`,
  );
};

const contentLength = (response: MapiResponse): number | undefined => {
  const raw = response.headers.find(
    (header) => header.name.toLowerCase() === "content-length",
  )?.value;
  if (raw === undefined) {
    return undefined;
  }

  const parsed = Number(raw);
  return Number.isNaN(parsed) ? undefined : parsed;
};

const rawContentType = (response: MapiResponse): string | undefined =>
  response.headers.find((header) => header.name.toLowerCase() === "content-type")?.value;

// The media type alone, for a message a human reads; the decision to print uses
// the raw value, because that is what the adapter parsed by.
const contentType = (response: MapiResponse): string | undefined =>
  rawContentType(response)?.split(";")[0]?.trim().toLowerCase();

const formatFailure = (response: MapiResponse, source: AuthSource): string => {
  const summary = `HTTP ${response.statusCode} ${response.statusText}`;

  if (response.statusCode !== 401) {
    return summary;
  }

  const hint = match(source)
    .with("header", () => "Check the Authorization header you supplied.")
    .with("mapi-key", () => "Check your Management API key.")
    .with("login", () => "Run `kontent login` to sign in again.")
    .exhaustive();

  return `${summary}\n${hint}`;
};

const describeCause = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);
