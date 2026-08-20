import { readFile } from "node:fs/promises";
import type { Header, HttpMethod } from "@kontent-ai/core-sdk";
import { match } from "ts-pattern";
import {
  type MapiRequestError,
  type MapiResponse,
  performRawMapiRequest,
} from "../../core/mapi/request.js";
import { formatAuthError } from "../../lib/auth/formatAuthError.js";
import { getValidAccessToken } from "../../lib/auth/tokenAccess.js";
import type { AuthError } from "../../lib/auth/types.js";
import { createMapiRawClient } from "../../lib/mapi/raw/client.js";
import { parseHeaders } from "../../lib/mapi/raw/headers.js";
import { err, isErr, map, ok, type Result, tryAsync } from "../../lib/result.js";
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
        .option("input", {
          type: "string",
          describe: 'File with the request body, or "-" to read stdin',
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

/**
 * Each source suppresses the ones below it, so a supplied credential never triggers
 * a keychain read that could fail on a machine that never ran `kontent login`.
 *
 * `KONTENT_MAPI_KEY` is read here rather than through a yargs option: the CLI does
 * not map env vars onto flags (see `src/index.ts`). It keeps the key off argv, so
 * CI and shared shells do not leak it through `ps` or shell history.
 */
export const resolveCredential = async (
  headers: ReadonlyArray<Header>,
  mapiKey: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): Promise<Result<Credential, AuthError>> => {
  if (headers.some((header) => header.name.toLowerCase() === "authorization")) {
    return ok({ source: "header" });
  }
  const suppliedKey = mapiKey ?? env.KONTENT_MAPI_KEY;
  if (suppliedKey !== undefined && suppliedKey !== "") {
    return ok({ token: suppliedKey, source: "mapi-key" });
  }
  return map(await getValidAccessToken(), (token) => ({ token, source: "login" }) as const);
};

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

  const credential = await resolveCredential(prepared.value.headers, args.mapiKey);
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

  writeResponse(result.value, args.include === true);

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

type AuthSource = "login" | "mapi-key" | "header";

type Credential = Readonly<{ token?: string | undefined; source: AuthSource }>;

const httpMethods = [
  "GET",
  "POST",
  "PUT",
  "DELETE",
  "PATCH",
] as const satisfies ReadonlyArray<HttpMethod>;

const prepareRequest = async (
  args: RequestArgs,
): Promise<Result<PreparedRequest, MapiRequestError>> => {
  const method = resolveMethod(args.method, args.input !== undefined);
  if (isErr(method)) {
    return method;
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

/**
 * Two rules, the same ones curl and `gh api` apply:
 *
 * - no `-X`: GET, or POST when `--input` supplies a body;
 * - `-X` given: that method verbatim, body included if there is one - so
 *   `-X GET --input` sends a GET with a body rather than second-guessing it.
 *
 * A yargs `default` would break the first rule: it is indistinguishable from a
 * typed `-X GET`, which would turn every `--input` into a GET with a body.
 */
const resolveMethod = (
  raw: string | undefined,
  hasInput: boolean,
): Result<HttpMethod, MapiRequestError> => {
  if (raw === undefined) {
    return ok(hasInput ? "POST" : "GET");
  }

  const method = httpMethods.find((known) => known === raw.toUpperCase());
  if (method === undefined) {
    return err({
      kind: "invalid-method",
      message: `Unsupported HTTP method "${raw}". Use one of ${httpMethods.join(", ")}.`,
    });
  }
  return ok(method);
};

const readInput = async (input: string): Promise<Result<Blob, MapiRequestError>> => {
  if (input !== "-") {
    return await tryAsync(
      async () => new Blob([Uint8Array.from(await readFile(input))]),
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

const readStdin = async (): Promise<Uint8Array<ArrayBuffer>> => {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  return Uint8Array.from(Buffer.concat(chunks));
};

const writeResponse = (response: MapiResponse, shouldIncludeHeaders: boolean): void => {
  if (shouldIncludeHeaders) {
    const headerLines = response.headers.map((header) => `${header.name}: ${header.value}`);
    process.stdout.write(
      [`HTTP/1.1 ${response.statusCode} ${response.statusText}`, ...headerLines, "", ""].join("\n"),
    );
  }

  if (response.payload !== null) {
    process.stdout.write(`${JSON.stringify(response.payload, null, 2)}\n`);
  }
};

const formatFailure = (response: MapiResponse, source: AuthSource): string => {
  const summary = `HTTP ${response.statusCode} ${response.statusText}${
    response.payload === null ? " (non-JSON response body omitted)" : ""
  }`;

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
