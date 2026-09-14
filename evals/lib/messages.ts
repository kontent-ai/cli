import type { SDKMessage, SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";

export const findResultMessage = (
  messages: ReadonlyArray<SDKMessage>,
): SDKResultMessage | undefined =>
  messages.findLast((message): message is SDKResultMessage => message.type === "result");
