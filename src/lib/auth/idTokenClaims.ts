export const decodeIdTokenClaims = (idToken: string): Record<string, unknown> => {
  const parts = idToken.split(".");
  const payload = parts[1];
  if (payload === undefined) {
    return {};
  }
  try {
    const json = Buffer.from(payload, "base64url").toString("utf8");
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return {};
  }
};
