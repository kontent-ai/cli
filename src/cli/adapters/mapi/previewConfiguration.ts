import { type Result, tryAsync } from "../../../core/lib/result.js";
import type { PreviewConfiguration } from "../../../core/project/previewConfiguration.js";
import type { MapiClient } from "./client.js";
import { mapiErrorMessage } from "./error.js";

/** The environment's preview configuration: domains and URL patterns for every space. */
export type PreviewConfigurationStore = Readonly<{
  read: () => Promise<Result<PreviewConfiguration, string>>;
  write: (configuration: PreviewConfiguration) => Promise<Result<void, string>>;
}>;

export const createPreviewConfigurationStore = (client: MapiClient): PreviewConfigurationStore => ({
  read: async () =>
    tryAsync(
      async () => (await client.getPreviewConfiguration().toPromise()).data._raw,
      mapiErrorMessage,
    ),
  write: async (configuration) =>
    tryAsync(async () => {
      await client.modifyPreviewConfiguration().withData(configuration).toPromise();
    }, mapiErrorMessage),
});
