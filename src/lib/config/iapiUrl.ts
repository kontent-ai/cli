import type { BaseUrl } from "@kontent-ai/core-sdk";

import { kontentAppHost } from "./kontentUrl.js";

export const iapiBaseUrl: BaseUrl = {
  protocol: "https",
  host: kontentAppHost(),
};
