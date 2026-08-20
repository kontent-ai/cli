import { inspect } from "node:util";
import type { KontentSdkError } from "@kontent-ai/core-sdk";

export type IapiErrorContext = Readonly<{ envId: string; isVerbose: boolean }>;

const httpStatusOf = (details: KontentSdkError["details"]): number | undefined =>
  "status" in details ? details.status : undefined;

export const formatIapiError = (error: KontentSdkError, context: IapiErrorContext): string => {
  const status = httpStatusOf(error.details);

  if (status === 401) {
    return "Your session is no longer valid. Run `kontent login` to sign in again.";
  }
  if (status === 403) {
    return `You don't have access to environment "${context.envId}". Check you're signed in with the right account (run \`kontent login\` to switch), or ask an admin to grant you access.`;
  }

  return formatGenericIapiError(error, context);
};

const formatGenericIapiError = (error: KontentSdkError, context: IapiErrorContext): string => {
  const { details } = error;
  const apiResponse = "kontentErrorResponse" in details ? details.kontentErrorResponse : undefined;

  const lines = [
    `[${details.reason}] ${error.message}`,
    "status" in details ? `status: ${details.status} ${details.statusText}` : undefined,
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
