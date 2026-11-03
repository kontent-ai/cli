import { match } from "ts-pattern";
import type { AuthError } from "../../../../core/auth/types.js";
import { decideEnvId, type ResolvedEnvId } from "../../../../core/environment/envId.js";
import { mapiBaseUrl } from "../../../../core/kontentUrl/kontentUrl.js";
import { isNone } from "../../../../core/lib/option.js";
import { err, isErr, map, ok, type Result } from "../../../../core/lib/result.js";
import { type AuthSource, decideMapiCredential } from "../../../../core/mapi/credential.js";
import { resolveMapiEndpoint } from "../../../../core/mapi/endpoint.js";
import { planRequest, type RequestArgsError } from "../../../../core/mapi/raw/request.js";
import type { PassthroughResponse } from "../../../../core/passthrough/response.js";
import { type Session, session } from "../../../adapters/auth/tokenAccess.js";
import { type CliConfigStore, cliConfigStore } from "../../../adapters/config/cliConfig.js";
import { createRawClient, type RawClient } from "../../../adapters/http/rawClient.js";
import {
  createRequestBodyReader,
  type RequestBodyError,
  type RequestBodyReader,
} from "../../../adapters/requestBody/requestBody.js";
import { createLoggerFromArgs, type Logger, type LogOptions } from "../../../log.js";
import type { CommandDeps } from "../../../types/yargs.js";
import {
  emitPassthroughOutput,
  usingStoredEnvironmentMessage,
} from "../../shared/passthroughOutput.js";
import { formatRequestOutput } from "./formatOutput.js";

export type RequestInput = Readonly<{
  endpoint: string;
  baseUrl: string;
  envId?: string | undefined;
  mapiKey?: string | undefined;
  envMapiKey?: string | undefined;
  method?: string | undefined;
  header?: ReadonlyArray<string> | undefined;
  input?: string | undefined;
}>;

export type RequestEffects = Readonly<{
  logger: Logger;
  config: Pick<CliConfigStore, "read">;
  bodyReader: RequestBodyReader;
  session: Session;
  mapi: Pick<RawClient, "send">;
}>;

export type RequestOutcome = Readonly<{
  response: PassthroughResponse;
  authSource: AuthSource;
  env: ResolvedEnvId;
}>;

/**
 * The ways a request ends without an HTTP answer to show the user. Every status the
 * API answers with, including 4xx and 5xx, is an `ok` outcome.
 */
export type RequestError =
  | Readonly<{ kind: "missing-env-id" }>
  | RequestArgsError
  | RequestBodyError
  | Readonly<{ kind: "auth-failed"; error: AuthError }>
  | Readonly<{
      kind: "invalid-endpoint" | "transport";
      message: string;
      authSource: AuthSource;
    }>;

export const request = async (
  effects: RequestEffects,
  input: RequestInput,
): Promise<Result<RequestOutcome, RequestError>> => {
  const storedEnvId = input.envId === undefined ? (await effects.config.read()).envId : undefined;
  const env = decideEnvId({ envIdFromFlag: input.envId, storedEnvId });
  if (isNone(env)) {
    return err({ kind: "missing-env-id" });
  }
  // A stored id is announced because nothing on the command line shows which environment
  // a request, possibly a DELETE, is about to hit.
  if (env.value.source === "stored") {
    effects.logger.info("standard", usingStoredEnvironmentMessage(env.value.envId));
  }

  // Planned before the input is read: there is no point opening a file the request can never carry.
  const planned = planRequest({
    method: input.method,
    header: input.header,
    hasBody: input.input !== undefined,
  });
  if (isErr(planned)) {
    return planned;
  }

  const body = input.input === undefined ? ok(null) : await effects.bodyReader.read(input.input);
  if (isErr(body)) {
    return body;
  }

  const credential = decideMapiCredential({
    headers: planned.value.headers,
    mapiKey: input.mapiKey,
    envMapiKey: input.envMapiKey,
  });
  const token = await match(credential)
    .with(
      { source: "header" },
      async (): Promise<Result<string | undefined, AuthError>> => ok(undefined),
    )
    .with({ source: "mapi-key" }, async ({ token }) => ok(token))
    .with({ source: "login" }, async () =>
      map(await effects.session.tokens(), (tokens) => tokens.accessToken),
    )
    .exhaustive();
  if (isErr(token)) {
    return err({ kind: "auth-failed", error: token.error });
  }

  const url = resolveMapiEndpoint(input.endpoint, {
    baseUrl: input.baseUrl,
    envId: env.value.envId,
  });
  if (isErr(url)) {
    return err({
      kind: "invalid-endpoint",
      message: url.error.message,
      authSource: credential.source,
    });
  }

  const sent = await effects.mapi.send(
    {
      url: url.value,
      method: planned.value.method,
      headers: planned.value.headers,
      body: body.value,
    },
    token.value,
  );
  if (isErr(sent)) {
    return err({ kind: "transport", message: sent.error, authSource: credential.source });
  }

  return ok({
    response: {
      statusCode: sent.value.status,
      statusText: sent.value.statusText,
      headers: sent.value.responseHeaders,
      body: sent.value.payload,
    },
    authSource: credential.source,
    env: env.value,
  });
};

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

export const runRequest = async (args: RequestArgs, deps: CommandDeps): Promise<void> => {
  const logger = createLoggerFromArgs(args);
  const tracker = deps.telemetry.startCommandTracking("mapi", logger);

  const result = await request(
    {
      logger,
      config: cliConfigStore,
      bodyReader: createRequestBodyReader(process.stdin),
      session,
      mapi: createRawClient({ logger }),
    },
    // KONTENT_MAPI_KEY is read here rather than through a yargs option: the CLI does not
    // map env vars onto flags (see `src/index.ts`). It keeps the key off argv, so CI and
    // shared shells do not leak it through `ps` or shell history.
    {
      ...args,
      baseUrl: mapiBaseUrl(deps.kontentTarget),
      envMapiKey: process.env.KONTENT_MAPI_KEY,
    },
  );

  emitPassthroughOutput(formatRequestOutput(result, args.include === true), logger, tracker);
};
