import { type EventEmitter, once } from "node:events";
import { match } from "ts-pattern";
import {
  type DapiAuthSource,
  type DapiCredentialError,
  decideDapiCredential,
} from "../../../../core/dapi/credential.js";
import { resolveDapiEndpoint } from "../../../../core/dapi/endpoint.js";
import { decideNextPage, type NextPage } from "../../../../core/dapi/nextPage.js";
import {
  endPaging,
  type PagedEnd,
  type PagedPage,
  type PagingState,
  startPaging,
  stepPaging,
} from "../../../../core/dapi/paging.js";
import { buildDapiHeaders } from "../../../../core/dapi/request.js";
import { decideEnvId } from "../../../../core/environment/envId.js";
import { deliverBaseUrl } from "../../../../core/kontentUrl/kontentUrl.js";
import { isNone, isSome, none, type Option } from "../../../../core/lib/option.js";
import { err, isErr, map, ok, type Result } from "../../../../core/lib/result.js";
import type { HeaderError } from "../../../../core/passthrough/headers.js";
import type { PassthroughResponse } from "../../../../core/passthrough/response.js";
import { type CliConfigStore, cliConfigStore } from "../../../adapters/config/cliConfig.js";
import {
  createRawClient,
  type RawClient,
  type RawNextPage,
  type RawRequest,
  type RawResponse,
} from "../../../adapters/http/rawClient.js";
import { createLoggerFromArgs, type Logger, type LogOptions } from "../../../log.js";
import type { CommandDeps } from "../../../types/yargs.js";
import {
  emitPassthroughOutput,
  usingStoredEnvironmentMessage,
} from "../../shared/passthroughOutput.js";
import { closePages, formatPage, formatRequestOutput } from "./formatOutput.js";

export type RequestInput = Readonly<{
  endpoint: string;
  baseUrl: Option<string>;
  envId?: string | undefined;
  dapiKey?: string | undefined;
  envDapiKey?: string | undefined;
  header?: ReadonlyArray<string> | undefined;
  isPreview: boolean;
  isWaitingForNewContent: boolean;
  isPaginated: boolean;
  maxPages?: number | undefined;
}>;

export type RequestEffects = Readonly<{
  logger: Logger;
  config: Pick<CliConfigStore, "read">;
  dapi: RawClient;
}>;

export type RequestOutcome =
  | Readonly<{
      kind: "response";
      response: PassthroughResponse;
      authSource: DapiAuthSource;
    }>
  | Readonly<{
      kind: "paged";
      pages: AsyncGenerator<PagedPage, PagedEnd>;
      authSource: DapiAuthSource;
    }>;

/**
 * The ways a request ends without an HTTP answer to show the user. Every status the API
 * answers a single request with, including 4xx and 5xx, is an `ok` outcome.
 */
export type RequestError =
  | Readonly<{ kind: "missing-env-id" }>
  | Readonly<{ kind: "delivery-unavailable" }>
  | HeaderError
  | DapiCredentialError
  | Readonly<{
      kind: "invalid-endpoint" | "transport";
      message: string;
      authSource: DapiAuthSource;
    }>;

/** A paged run after its pages were printed: only how it ended is left to present. */
export type PrintedOutcome =
  | Extract<RequestOutcome, { kind: "response" }>
  | Readonly<{ kind: "paged-end"; end: PagedEnd; authSource: DapiAuthSource }>;

export const request = async (
  effects: RequestEffects,
  input: RequestInput,
): Promise<Result<RequestOutcome, RequestError>> => {
  if (isNone(input.baseUrl)) {
    return err({ kind: "delivery-unavailable" });
  }
  const storedEnvId = input.envId === undefined ? (await effects.config.read()).envId : undefined;
  const env = decideEnvId({ envIdFromFlag: input.envId, storedEnvId });
  if (isNone(env)) {
    return err({ kind: "missing-env-id" });
  }
  // A stored id is announced because nothing on the command line shows which environment
  // the request reads from.
  if (env.value.source === "stored") {
    effects.logger.info("standard", usingStoredEnvironmentMessage(env.value.envId));
  }

  const headers = buildDapiHeaders({
    header: input.header,
    isWaitingForNewContent: input.isWaitingForNewContent,
  });
  if (isErr(headers)) {
    return headers;
  }

  const credential = decideDapiCredential({
    headers: headers.value,
    dapiKey: input.dapiKey,
    envDapiKey: input.envDapiKey,
    isPreview: input.isPreview,
  });
  if (isErr(credential)) {
    return credential;
  }
  const authSource = credential.value.source;
  const key = credential.value.source === "dapi-key" ? credential.value.key : undefined;

  const url = resolveDapiEndpoint(input.endpoint, {
    baseUrl: input.baseUrl.value,
    envId: env.value.envId,
  });
  if (isErr(url)) {
    return err({ kind: "invalid-endpoint", message: url.error.message, authSource });
  }

  const rawRequest: RawRequest = {
    url: url.value,
    method: "GET",
    headers: headers.value,
    body: null,
  };

  if (!input.isPaginated) {
    const sent = await effects.dapi.send(rawRequest, key);
    if (isErr(sent)) {
      return err({ kind: "transport", message: sent.error, authSource });
    }
    return ok({
      kind: "response",
      response: toPassthroughResponse(sent.value),
      authSource,
    });
  }

  const pages = effects.dapi.pages(rawRequest, key, {
    maxPages: input.maxPages,
    nextPage: (page) =>
      toRawNextPage(decideNextPage({ payload: page.payload, headers: page.responseHeaders })),
  });
  return ok({
    kind: "paged",
    pages: streamPages(pages, startPaging(input.endpoint, headers.value)),
    authSource,
  });
};

type RequestArgs = LogOptions &
  Readonly<{
    endpoint: string;
    envId?: string | undefined;
    preview?: boolean | undefined;
    dapiKey?: string | undefined;
    header?: ReadonlyArray<string> | undefined;
    include?: boolean | undefined;
    waitForNewContent?: boolean | undefined;
    paginate?: boolean | undefined;
    slurp?: boolean | undefined;
    maxPages?: number | undefined;
  }>;

export const runRequest = async (args: RequestArgs, deps: CommandDeps): Promise<void> => {
  const logger = createLoggerFromArgs(args);
  const tracker = deps.telemetry.startCommandTracking("dapi", logger);
  const isPreview = args.preview === true;

  const result = await request(
    { logger, config: cliConfigStore, dapi: createRawClient({ logger }) },
    // KONTENT_DAPI_KEY is read here rather than through a yargs option: the CLI does not
    // map env vars onto flags (see `src/index.ts`), and it keeps the key off argv.
    {
      endpoint: args.endpoint,
      baseUrl: deliverBaseUrl(deps.kontentTarget, isPreview),
      envId: args.envId,
      dapiKey: args.dapiKey,
      envDapiKey: process.env.KONTENT_DAPI_KEY,
      header: args.header,
      isPreview,
      isWaitingForNewContent: args.waitForNewContent === true,
      isPaginated: args.paginate === true,
      maxPages: args.maxPages,
    },
  );

  const printed = isErr(result)
    ? result
    : ok(await printOutcome(result.value, args.slurp === true));

  emitPassthroughOutput(formatRequestOutput(printed, args.include === true), logger, tracker);
};

export const printPages = async (
  pages: AsyncGenerator<PagedPage, PagedEnd>,
  stdout: Pick<NodeJS.WriteStream, "write" | "writable"> & EventEmitter,
  shouldSlurp: boolean,
  printedCount: number,
): Promise<PagedEnd> => {
  // The reader quit (`| head`): every further page would be fetched only to be thrown away.
  if (printedCount > 0 && !stdout.writable) {
    const end: PagedEnd = { kind: "complete", pageCount: printedCount, resume: none };
    await pages.return(end);
    return end;
  }
  const next = await pages.next();
  if (next.done === true) {
    stdout.write(closePages(shouldSlurp, printedCount > 0));
    return next.value;
  }
  const isFlushed = stdout.write(formatPage(next.value, shouldSlurp));
  // A write to a reader that quit fails right here, and Node resets the stream once the
  // error is emitted: only now, with no await in between, does `writable` tell it apart
  // from a reader that is merely slow.
  if (!isFlushed && stdout.writable) {
    await waitForReader(stdout);
  }
  return printPages(pages, stdout, shouldSlurp, printedCount + 1);
};

const printOutcome = async (
  outcome: RequestOutcome,
  shouldSlurp: boolean,
): Promise<PrintedOutcome> =>
  outcome.kind === "response"
    ? outcome
    : {
        kind: "paged-end",
        end: await printPages(outcome.pages, process.stdout, shouldSlurp, 0),
        authSource: outcome.authSource,
      };

// A pipe write only queues the page; fetching on before the reader takes it holds the whole
// export in memory. A reader that quits mid-wait never drains, so close ends the wait too, and
// the next write then fails.
const waitForReader = async (stdout: EventEmitter): Promise<void> => {
  const controller = new AbortController();
  await Promise.race([
    once(stdout, "drain", { signal: controller.signal }),
    once(stdout, "close", { signal: controller.signal }),
  ]).catch(() => undefined);
  controller.abort();
};

async function* streamPages(
  pages: AsyncIterable<Result<RawResponse, string>>,
  start: PagingState,
): AsyncGenerator<PagedPage, PagedEnd> {
  // Reassigned once per page: a loop keeps a long run from nesting one generator per page.
  let state = start;

  for await (const page of pages) {
    const step = stepPaging(state, map(page, toPassthroughResponse));
    if (step.kind === "end") {
      if (isSome(step.page)) {
        yield step.page.value;
      }
      return step.end;
    }
    yield step.page;
    state = step.state;
  }

  return endPaging(state);
}

const toRawNextPage = (next: NextPage): RawNextPage =>
  match(next)
    .returnType<RawNextPage>()
    .with({ kind: "continuation" }, ({ token }) => ({ continuationToken: token }))
    .with({ kind: "url" }, ({ url }) => ({ nextPageUrl: url }))
    .with({ kind: "none" }, () => ({}))
    .exhaustive();

const toPassthroughResponse = (response: RawResponse): PassthroughResponse => ({
  statusCode: response.status,
  statusText: response.statusText,
  headers: response.responseHeaders,
  body: response.payload,
});
