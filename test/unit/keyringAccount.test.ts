import { describe, expect, it } from "vitest";
import { accountFor } from "../../src/cli/adapters/auth/storage.js";
import { type LoginContext, loginContextFor } from "../../src/core/auth/loginContext.js";

const PRODUCTION: LoginContext = loginContextFor(
  { domain: "login.example.com", clientId: "client", audience: "https://api.example.com/" },
  { kind: "domain", domain: "kontent.ai" },
);

describe("accountFor", () => {
  it("joins the login context into a stable JSON array", () => {
    expect(accountFor(PRODUCTION)).toBe(
      '["login.example.com","client","https://api.example.com/","kontent.ai"]',
    );
    expect(accountFor({ ...PRODUCTION })).toBe(accountFor(PRODUCTION));
  });

  it("uses the origin of a host target", () => {
    const local: LoginContext = {
      ...PRODUCTION,
      target: { kind: "host", baseUrl: { protocol: "http", host: "localhost:3000" } },
    };

    expect(accountFor(local)).toBe(
      '["login.example.com","client","https://api.example.com/","http://localhost:3000"]',
    );
  });

  it.each<readonly [string, LoginContext]>([
    ["the Auth0 domain", { ...PRODUCTION, auth0Domain: "login.qa.example.com" }],
    ["the client ID", { ...PRODUCTION, clientId: "qa-client" }],
    ["the audience", { ...PRODUCTION, audience: "https://api.qa.example.com/" }],
    ["the target", { ...PRODUCTION, target: { kind: "domain", domain: "qa.example.com" } }],
    [
      "the host scheme",
      {
        ...PRODUCTION,
        target: { kind: "host", baseUrl: { protocol: "https", host: "localhost" } },
      },
    ],
    ["the case of a value", { ...PRODUCTION, auth0Domain: "LOGIN.example.com" }],
    ["whitespace in a value", { ...PRODUCTION, clientId: "client " }],
  ])("differs when %s differs", (_, other) => {
    expect(accountFor(other)).not.toBe(accountFor(PRODUCTION));
  });
});
