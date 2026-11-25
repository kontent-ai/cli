import { BaseTransport, type Response, type Transport } from "@amplitude/analytics-core";

/**
 * Amplitude's own Node transport sets no request timeout, so on a network that drops
 * packets its open socket kept the process alive long after the command finished.
 * Resolving `null` on a failure or timeout is what the SDK's transport does too.
 */
export const createBoundedTransport = (timeoutMs: number): Transport => ({
  send: async (serverUrl, payload) => {
    try {
      const response = await fetch(serverUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "*/*" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(timeoutMs),
      });
      return toResponse(await response.text(), response.status);
    } catch {
      return null;
    }
  },
});

const responseBuilder = new BaseTransport();

const toResponse = (responseText: string, statusCode: number): Response | null => {
  try {
    return responseBuilder.buildResponse(JSON.parse(responseText) as Record<string, unknown>);
  } catch {
    return responseBuilder.buildResponse({ code: statusCode });
  }
};
