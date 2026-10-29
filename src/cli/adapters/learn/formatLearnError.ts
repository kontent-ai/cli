import type { KontentSdkError } from "@kontent-ai/core-sdk";
import { match } from "ts-pattern";
import { errorMessage } from "../../../core/lib/error.js";

export const formatLearnError = (error: KontentSdkError): string =>
  match(error.details)
    .returnType<string>()
    // core-sdk's own message only points at the wrapped error; the cause is what the user can act on.
    .with({ reason: "adapterError" }, ({ originalError }) =>
      joinLines([
        `Could not reach the Learn service: ${errorMessage(originalError)}`,
        urlLine(error),
      ]),
    )
    .with({ reason: "parsingFailed" }, () =>
      joinLines(["The Learn service answered with an unexpected shape.", urlLine(error)]),
    )
    .otherwise((details) =>
      joinLines([
        `[${details.reason}] ${error.message}`,
        "status" in details ? statusLine(details.status, details.statusText) : undefined,
        urlLine(error),
      ]),
    );

const urlLine = (error: KontentSdkError): string => `url: ${String(error.url)}`;

const joinLines = (lines: ReadonlyArray<string | undefined>): string =>
  lines.filter((line) => line !== undefined).join("\n");

// HTTP/2 carries no reason phrase, so the line ends at the code when none was sent.
const statusLine = (status: number, statusText: string): string =>
  statusText === "" ? `status: ${status}` : `status: ${status} ${statusText}`;
