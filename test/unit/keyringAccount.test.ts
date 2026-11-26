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
});
