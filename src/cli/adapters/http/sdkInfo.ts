import type { SdkInfo } from "@kontent-ai/core-sdk";
// biome-ignore lint/correctness/useImportExtensions: JSON imports must keep the .json extension
import pkg from "../../../../package.json" with { type: "json" };

/** How the CLI identifies itself to Kontent.ai services on every core-sdk request. */
export const cliSdkInfo: SdkInfo = {
  name: pkg.name,
  version: pkg.version,
  host: "npmjs.com",
};
