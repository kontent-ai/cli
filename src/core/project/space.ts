import { mapiErrorMessage } from "../../lib/error.js";
import type { MapiClient } from "../../lib/mapi/client.js";
import { isErr, ok, type Result, tryAsync } from "../../lib/result.js";

const SPACE_NAME = "localhost";
const SPACE_CODENAME = "localhost";
export const PREVIEW_PORT = 3000;
const PREVIEW_DOMAIN = `localhost:${PREVIEW_PORT}`;

export type SpaceSetupError = Readonly<{
  kind: "space-failed" | "preview-failed";
  message: string;
}>;

export type SpaceSetupResult = Readonly<{
  previewDomain: string;
  wasSet: boolean;
}>;

export const ensureLocalhostSpace = async (
  mapiClient: MapiClient,
): Promise<Result<SpaceSetupResult, SpaceSetupError>> => {
  const existing = await findSpaceId(mapiClient, SPACE_CODENAME);
  if (isErr(existing)) {
    return existing;
  }

  const spaceResult =
    existing.value !== undefined
      ? ok(existing.value)
      : await createSpace(mapiClient, SPACE_NAME, SPACE_CODENAME);
  if (isErr(spaceResult)) {
    return spaceResult;
  }

  return ensurePreviewDomain(mapiClient, spaceResult.value, PREVIEW_DOMAIN);
};

const findSpaceId = async (
  client: MapiClient,
  codename: string,
): Promise<Result<string | undefined, SpaceSetupError>> =>
  tryAsync(
    async () => {
      const spaces = (await client.listSpaces().toPromise()).data;
      return spaces.find((space) => space.codename === codename)?.id;
    },
    (cause) => ({ kind: "space-failed", message: mapiErrorMessage(cause) }),
  );

const createSpace = async (
  client: MapiClient,
  name: string,
  codename: string,
): Promise<Result<string, SpaceSetupError>> =>
  tryAsync(
    async () => (await client.addSpace().withData({ name, codename }).toPromise()).data.id,
    (cause) => ({ kind: "space-failed", message: mapiErrorMessage(cause) }),
  );

const ensurePreviewDomain = async (
  client: MapiClient,
  spaceId: string,
  domain: string,
): Promise<Result<SpaceSetupResult, SpaceSetupError>> =>
  tryAsync(
    async () => {
      const current = (await client.getPreviewConfiguration().toPromise()).data._raw;
      const existing = current.space_domains.find((entry) => entry.space.id === spaceId);
      if (existing !== undefined && existing.domain !== "") {
        return { previewDomain: existing.domain, wasSet: false };
      }

      const ourEntry = { space: { id: spaceId }, domain };
      const spaceDomains =
        existing !== undefined
          ? current.space_domains.map((entry) => (entry.space.id === spaceId ? ourEntry : entry))
          : [...current.space_domains, ourEntry];

      await client
        .modifyPreviewConfiguration()
        .withData({
          space_domains: spaceDomains,
          preview_url_patterns: current.preview_url_patterns,
        })
        .toPromise();

      return { previewDomain: domain, wasSet: true };
    },
    (cause) => ({ kind: "preview-failed", message: mapiErrorMessage(cause) }),
  );
