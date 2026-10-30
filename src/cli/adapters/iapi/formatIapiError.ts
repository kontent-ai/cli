import { inspect } from "node:util";
import type { KontentSdkError } from "@kontent-ai/core-sdk";

export type IapiErrorContext = Readonly<{ isVerbose: boolean }>;

export const iapiHttpStatus = (error: KontentSdkError): number | undefined =>
  "status" in error.details ? error.details.status : undefined;

export const formatIapiError = (error: KontentSdkError, context: IapiErrorContext): string => {
  const { details } = error;
  const apiResponse = "kontentErrorResponse" in details ? details.kontentErrorResponse : undefined;

  const lines = [
    `[${details.reason}] ${error.message}`,
    "status" in details ? statusLine(details.status, details.statusText) : undefined,
    apiResponse?.message ? `message: ${apiResponse.message}` : undefined,
    apiResponse?.request_id ? `request-id: ${apiResponse.request_id}` : undefined,
    // String(): Node's URL declares no toString of its own, unlike the DOM interface.
    `url: ${String(error.url)}`,
    context.isVerbose
      ? `details: ${inspect(details, { depth: 5, colors: false, breakLength: 100 })}`
      : undefined,
  ];

  return lines.filter((line) => line !== undefined).join("\n");
};

// HTTP/2 carries no reason phrase, so the line ends at the code when none was sent.
const statusLine = (status: number, statusText: string): string =>
  statusText === "" ? `status: ${status}` : `status: ${status} ${statusText}`;
