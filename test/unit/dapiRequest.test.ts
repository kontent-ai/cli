import { describe, expect, it, vi } from "vitest";
import type { RawResponse } from "../../src/cli/adapters/http/rawClient.js";
import {
  type RequestEffects,
  type RequestInput,
  request,
} from "../../src/cli/commands/dapi/request/runRequest.js";
import type { Logger } from "../../src/cli/log.js";
import type { PagedEnd, PagedPage } from "../../src/core/dapi/paging.js";
import { none, some } from "../../src/core/lib/option.js";
import { err, ok, type Result } from "../../src/core/lib/result.js";
import { assertOk } from "../helpers/assertResult.js";

const ENV_ID = "11111111-2222-3333-4444-555555555555";
const BASE_URL = "https://deliver.test";

const response = (overrides: Partial<RawResponse> = {}): RawResponse => ({
  status: 200,
  statusText: "OK",
  responseHeaders: [],
  payload: { items: [] },
  ...overrides,
});

const fakeLogger = (): Logger => ({
  info: () => {},
  warning: () => {},
  error: () => {},
  isVerbose: false,
});

const fakeEffects = (
  options: Readonly<{
    storedEnvId?: string;
    sent?: Result<RawResponse, string>;
    pages?: ReadonlyArray<Result<RawResponse, string>>;
  }> = {},
) => {
  const effects = {
    logger: fakeLogger(),
    config: { read: vi.fn(() => Promise.resolve({ envId: options.storedEnvId })) },
    dapi: {
      send: vi.fn(() => Promise.resolve(options.sent ?? ok(response()))),
      pages: vi.fn(async function* () {
        yield* options.pages ?? [];
      }),
    },
  } satisfies RequestEffects;
  return effects;
};

const input = (overrides: Partial<RequestInput> = {}): RequestInput => ({
  endpoint: "items",
  baseUrl: some(BASE_URL),
  envId: ENV_ID,
  isPreview: false,
  isWaitingForNewContent: false,
  isPaginated: false,
  ...overrides,
});

describe("dapi request", () => {
  it("sends a keyless GET to the environment's Delivery path", async () => {
    const effects = fakeEffects();

    const result = await request(effects, input());

    assertOk(result);
    expect(result.value.kind).toBe("response");
    expect(effects.dapi.send).toHaveBeenCalledWith(
      {
        url: new URL(`${BASE_URL}/${ENV_ID}/items`),
        method: "GET",
        headers: [],
        body: null,
      },
      undefined,
    );
  });

  it("sends KONTENT_DAPI_KEY as the key", async () => {
    const effects = fakeEffects();

    await request(effects, input({ envDapiKey: "env-key" }));

    expect(effects.dapi.send).toHaveBeenCalledWith(expect.anything(), "env-key");
  });

  it("fails a keyless preview without sending anything", async () => {
    const effects = fakeEffects();

    const result = await request(effects, input({ isPreview: true }));

    expect(result).toEqual(err({ kind: "missing-preview-key" }));
    expect(effects.dapi.send).not.toHaveBeenCalled();
  });

  it("fails when the target serves no Delivery API", async () => {
    const effects = fakeEffects();

    const result = await request(effects, input({ baseUrl: none }));

    expect(result).toEqual(err({ kind: "delivery-unavailable" }));
    expect(effects.dapi.send).not.toHaveBeenCalled();
  });

  it("falls back to the stored environment", async () => {
    const effects = fakeEffects({ storedEnvId: ENV_ID });
    const info = vi.fn();

    await request({ ...effects, logger: { ...effects.logger, info } }, input({ envId: undefined }));

    expect(info).toHaveBeenCalledWith(
      "standard",
      `Using the stored default environment ${ENV_ID}.`,
    );
    expect(effects.dapi.send).toHaveBeenCalledWith(
      expect.objectContaining({ url: new URL(`${BASE_URL}/${ENV_ID}/items`) }),
      undefined,
    );
  });

  describe("--paginate", () => {
    const feedPage = (items: ReadonlyArray<number>, token?: string) =>
      ok(
        response({
          payload: { items: [...items] },
          responseHeaders: token === undefined ? [] : [{ name: "X-Continuation", value: token }],
        }),
      );

    const runPaged = async (
      pages: ReadonlyArray<Result<RawResponse, string>>,
      overrides: Partial<RequestInput> = {},
    ): Promise<Readonly<{ printed: ReadonlyArray<PagedPage>; end: PagedEnd }>> => {
      const result = await request(
        fakeEffects({ pages }),
        input({ endpoint: "items-feed", isPaginated: true, ...overrides }),
      );
      assertOk(result);
      if (result.value.kind !== "paged") {
        throw new Error("Expected a paged outcome");
      }
      return drain(result.value.pages, []);
    };

    it("hands out every page as it arrives", async () => {
      const { printed, end } = await runPaged([feedPage([1], "token-2"), feedPage([2])]);

      expect(printed).toEqual([
        { payload: { items: [1] }, pageNumber: 1 },
        { payload: { items: [2] }, pageNumber: 2 },
      ]);
      expect(end).toEqual({ kind: "complete", pageCount: 2, resume: none });
    });

    it("says where to continue when --maxPages stopped it early", async () => {
      const { end } = await runPaged([feedPage([1], "token-2")], { maxPages: 1 });

      expect(end).toEqual({
        kind: "complete",
        pageCount: 1,
        resume: some({ endpoint: "items-feed", continuationToken: "token-2" }),
      });
    });
  });
});

const drain = async (
  pages: AsyncGenerator<PagedPage, PagedEnd>,
  printed: ReadonlyArray<PagedPage>,
): Promise<Readonly<{ printed: ReadonlyArray<PagedPage>; end: PagedEnd }>> => {
  const next = await pages.next();
  return next.done === true ? { printed, end: next.value } : drain(pages, [...printed, next.value]);
};
