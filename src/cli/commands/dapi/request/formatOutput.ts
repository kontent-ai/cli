import { match } from "ts-pattern";
import type { DapiAuthSource } from "../../../../core/dapi/credential.js";
import { continuationTokenOf, type ResumePoint } from "../../../../core/dapi/nextPage.js";
import type { PagedEnd, PagedPage } from "../../../../core/dapi/paging.js";
import { isSome } from "../../../../core/lib/option.js";
import { isErr, type Result } from "../../../../core/lib/result.js";
import type { PassthroughResponse } from "../../../../core/passthrough/response.js";
import {
  failedOutput,
  formatResponseOutput,
  MISSING_ENV_ID_OUTPUT,
  type PassthroughOutput,
} from "../../shared/passthroughOutput.js";
import type { PrintedOutcome, RequestError } from "./runRequest.js";

export const formatRequestOutput = (
  result: Result<PrintedOutcome, RequestError>,
  shouldIncludeHeaders: boolean,
): PassthroughOutput =>
  isErr(result)
    ? formatErrorOutput(result.error)
    : formatOutcome(result.value, shouldIncludeHeaders);

/**
 * One page as it goes to stdout: one JSON document per page, like `gh api --paginate`, or
 * an element of one array with --slurp. The array is always closed by `closePages`.
 */
export const formatPage = (page: PagedPage, shouldSlurp: boolean): string => {
  const json = JSON.stringify(page.payload, null, 2);
  if (!shouldSlurp) {
    return `${json}\n`;
  }
  return page.pageNumber === 1 ? `[\n${json}` : `,\n${json}`;
};

export const closePages = (shouldSlurp: boolean, hasPrinted: boolean): string =>
  shouldSlurp && hasPrinted ? "\n]\n" : "";

const formatOutcome = (outcome: PrintedOutcome, shouldIncludeHeaders: boolean): PassthroughOutput =>
  match(outcome)
    .with({ kind: "response" }, ({ response, authSource }) => {
      const output = formatSingleResponse(response, authSource, shouldIncludeHeaders);
      // items-feed and used-in announce further pages only in a header, invisible without -i.
      const hasMorePages =
        response.statusCode < 400 && (continuationTokenOf(response.headers) ?? "") !== "";
      return hasMorePages
        ? {
            ...output,
            stderr: [
              ...output.stderr,
              {
                level: "info" as const,
                text: "More pages are available. Add --paginate to fetch them all.",
              },
            ],
          }
        : output;
    })
    .with({ kind: "paged-end" }, ({ end, authSource }) =>
      formatPagedEnd(end, authSource, shouldIncludeHeaders),
    )
    .exhaustive();

const formatSingleResponse = (
  response: PassthroughResponse,
  authSource: DapiAuthSource,
  shouldIncludeHeaders: boolean,
): PassthroughOutput =>
  formatResponseOutput(response, {
    shouldIncludeHeaders,
    properties: { "auth-source": authSource },
    describeFailure: (failed) => formatFailure(failed, authSource),
  });

const formatPagedEnd = (
  end: PagedEnd,
  authSource: DapiAuthSource,
  shouldIncludeHeaders: boolean,
): PassthroughOutput =>
  match(end)
    .returnType<PassthroughOutput>()
    .with({ kind: "complete" }, ({ pageCount, resume }) => ({
      stdout: "",
      stderr: isSome(resume)
        ? [
            {
              level: "info",
              text: `Stopped after ${pageCount} page${pageCount === 1 ? "" : "s"} (--maxPages). To continue, run:\n  ${formatResumeCommand(resume.value)}`,
            },
          ]
        : [],
      isFailure: false,
      telemetry: { outcome: "succeed", properties: { "auth-source": authSource } },
    }))
    .with({ kind: "first-page-response" }, ({ response }) =>
      formatSingleResponse(response, authSource, shouldIncludeHeaders),
    )
    .with({ kind: "first-page-transport" }, ({ message }) =>
      failedOutput("transport", message, { "auth-source": authSource }),
    )
    .with({ kind: "page-failed" }, ({ pageNumber, reason, resume }) =>
      failedOutput(
        "page-failed",
        `Page ${pageNumber} failed: ${reason}. The pages before it were printed. To retry from that page, run:\n  ${formatResumeCommand(resume)}`,
        { "auth-source": authSource },
      ),
    )
    .exhaustive();

const formatErrorOutput = (error: RequestError): PassthroughOutput =>
  match(error)
    .with({ kind: "missing-env-id" }, () => MISSING_ENV_ID_OUTPUT)
    .with({ kind: "delivery-unavailable" }, () =>
      failedOutput(
        "delivery-unavailable",
        "The Delivery API doesn't run on a local stack. Set KONTENT_URL to kontent.ai or an on-demand environment (https://<label>-draft.devkontentmasters.com) to use `kontent dapi`.",
      ),
    )
    .with({ kind: "missing-preview-key" }, () =>
      failedOutput(
        "missing-preview-key",
        "--preview needs a Delivery API key with Content preview access. Set KONTENT_DAPI_KEY, pass --dapiKey <key>, or send an Authorization header.",
      ),
    )
    .with({ kind: "invalid-header" }, (e) => failedOutput(e.kind, e.message))
    .with({ kind: "invalid-endpoint" }, { kind: "transport" }, (e) =>
      failedOutput(e.kind, e.message, { "auth-source": e.authSource }),
    )
    .exhaustive();

// The user adds back their other options: only the endpoint and the continuation change.
const formatResumeCommand = (resume: ResumePoint): string =>
  [
    `kontent dapi ${shellQuote(resume.endpoint)} --paginate`,
    ...(resume.continuationToken === undefined
      ? []
      : [`-H ${shellQuote(`X-Continuation: ${resume.continuationToken}`)}`]),
    "(plus your other options)",
  ].join(" ");

// Single quotes keep "?" and "&" literal; a quote inside the value is closed, escaped and reopened.
const shellQuote = (value: string): string => `'${value.replaceAll("'", "'\\''")}'`;

const formatFailure = (response: PassthroughResponse, authSource: DapiAuthSource): string => {
  const summary = `HTTP ${response.statusCode}`;

  return response.statusCode === 401 ? `${summary}\n${formatCredentialHint(authSource)}` : summary;
};

const formatCredentialHint = (source: DapiAuthSource): string =>
  match(source)
    .with("header", () => "Check the Authorization header you supplied.")
    .with(
      "dapi-key",
      () =>
        "Check your Delivery API key: it must cover this environment, with Secure access, or Content preview access for --preview.",
    )
    .with(
      "none",
      () =>
        "This environment has secure access enabled. Set KONTENT_DAPI_KEY or pass --dapiKey <key> with a Delivery API key that has Secure access.",
    )
    .exhaustive();
