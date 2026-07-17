import { decodeIdTokenClaims } from "./idTokenClaims.js";

export const deriveIdentifier = (idToken: string | undefined): string | undefined => {
  if (idToken === undefined) {
    return undefined;
  }

  const email = decodeIdTokenClaims(idToken).email;
  return typeof email === "string" && email.length > 0 ? email : undefined;
};
