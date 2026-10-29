import { describe, expect, it } from "vitest";
import {
  type PreviewConfiguration,
  planPreviewConfiguration,
} from "../../src/core/project/previewConfiguration.js";

const KARMA_SPACE = "karma-space";
const LOCAL_SPACE = "local-space";
const PREVIEW = "https://{Space}/api/preview/enable?returnTo=";

// The preview configuration of a fresh Karma sample environment.
const karmaSample: PreviewConfiguration = {
  space_domains: [{ space: { id: KARMA_SPACE }, domain: "karma.sample.kontent.ai" }],
  preview_url_patterns: [
    {
      content_type: { id: "landing-page" },
      url_patterns: [{ space: null, url_pattern: `${PREVIEW}/envid/{EnvironmentId}` }],
    },
    {
      content_type: { id: "blog-post" },
      url_patterns: [
        { space: null, url_pattern: `${PREVIEW}/envid/{EnvironmentId}/blog/{URLslug}` },
      ],
    },
  ],
};

describe("planPreviewConfiguration", () => {
  it("adds localhost preview next to the Karma sample's space, without the environment segment", () => {
    const plan = planPreviewConfiguration(karmaSample, {
      spaceId: LOCAL_SPACE,
      domain: "localhost:3000",
      // Listed before the localhost space was created, as on a first run.
      existingSpaceIds: [KARMA_SPACE],
    });

    expect(plan).toEqual({
      configuration: {
        space_domains: [
          { space: { id: KARMA_SPACE }, domain: "karma.sample.kontent.ai" },
          { space: { id: LOCAL_SPACE }, domain: "localhost:3000" },
        ],
        preview_url_patterns: [
          {
            content_type: { id: "landing-page" },
            url_patterns: [
              { space: null, url_pattern: `${PREVIEW}/envid/{EnvironmentId}` },
              { space: { id: LOCAL_SPACE }, url_pattern: PREVIEW },
            ],
          },
          {
            content_type: { id: "blog-post" },
            url_patterns: [
              { space: null, url_pattern: `${PREVIEW}/envid/{EnvironmentId}/blog/{URLslug}` },
              { space: { id: LOCAL_SPACE }, url_pattern: `${PREVIEW}/blog/{URLslug}` },
            ],
          },
        ],
      },
      domainDecision: { kind: "added", domain: "localhost:3000" },
    });
  });
});
