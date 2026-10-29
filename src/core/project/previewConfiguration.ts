import type { PreviewContracts } from "@kontent-ai/management-sdk";

export type PreviewConfiguration = PreviewContracts.IPreviewConfigurationContract;

export type PreviewDomainDecision =
  | Readonly<{ kind: "added"; domain: string }>
  | Readonly<{ kind: "kept"; domain: string }>;

export type PreviewPlan = Readonly<{
  configuration: PreviewConfiguration;
  domainDecision: PreviewDomainDecision;
}>;

/**
 * The preview configuration to send back. modifyPreviewConfiguration is a full-document PUT
 * that validates every space reference, so a reference to a deleted space (e.g. a prior
 * localhost space) left in the config would reject the whole request. Only references to
 * spaces that still exist are kept. A domain the space already has is left as it is.
 */
export const planPreviewConfiguration = (
  current: PreviewConfiguration,
  inputs: Readonly<{ spaceId: string; domain: string; existingSpaceIds: ReadonlyArray<string> }>,
): PreviewPlan => {
  const { spaceId, domain } = inputs;
  const liveSpaceIds = new Set([...inputs.existingSpaceIds, spaceId]);

  const existing = current.space_domains.find((entry) => entry.space.id === spaceId);
  const hasDomain = existing !== undefined && existing.domain !== "";

  const ourEntry = { space: { id: spaceId }, domain };
  const keptDomains = current.space_domains.filter((entry) => liveSpaceIds.has(entry.space.id));
  const spaceDomains =
    existing !== undefined
      ? keptDomains.map((entry) => (entry.space.id === spaceId && !hasDomain ? ourEntry : entry))
      : [...keptDomains, ourEntry];

  const keptPatterns = current.preview_url_patterns.map((patterns) => ({
    ...patterns,
    url_patterns: patterns.url_patterns.filter(
      (pattern) => pattern.space === null || liveSpaceIds.has(pattern.space.id),
    ),
  }));

  return {
    configuration: {
      space_domains: spaceDomains,
      preview_url_patterns: keptPatterns.map((patterns) => withLocalhostPattern(patterns, spaceId)),
    },
    domainDecision: hasDomain
      ? { kind: "kept", domain: existing.domain }
      : { kind: "added", domain },
  };
};

const ENV_MACRO_SEGMENT = "/envid/{EnvironmentId}";

const withLocalhostPattern = (
  patterns: PreviewContracts.IPreviewUrlPatternsContract,
  spaceId: string,
): PreviewContracts.IPreviewUrlPatternsContract => {
  const source =
    patterns.url_patterns.find((pattern) => pattern.space === null) ?? patterns.url_patterns[0];
  if (source === undefined) {
    return patterns;
  }

  const localhostUrl = source.url_pattern.replace(ENV_MACRO_SEGMENT, "");
  const others = patterns.url_patterns.filter((pattern) => pattern.space?.id !== spaceId);
  return {
    ...patterns,
    url_patterns: [...others, { space: { id: spaceId }, url_pattern: localhostUrl }],
  };
};
