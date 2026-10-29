import { describe, expect, it } from "vitest";
import {
  iapiBaseUrl,
  mapiBaseUrl,
  resolveKontentTarget,
} from "../../src/core/kontentUrl/kontentUrl.js";
import { map, ok } from "../../src/core/lib/result.js";

const resolve = (kontentUrl: string) =>
  resolveKontentTarget({ fromEnv: kontentUrl, baked: undefined });

describe("resolveKontentTarget", () => {
  it.each([
    { input: "kontent.ai" },
    { input: "devkontentmasters.com" },
  ] as const)("accepts allowed bare host $input", ({ input }) => {
    expect(resolve(input)).toEqual(ok({ kind: "domain", domain: input }));
  });

  it.each([
    {
      input: "https://my-feature-draft.devkontentmasters.com",
      expected: { protocol: "https", host: "my-feature-draft.devkontentmasters.com" },
    },
    { input: "http://localhost:29595", expected: { protocol: "http", host: "localhost:29595" } },
    { input: "http://localhost:29595/", expected: { protocol: "http", host: "localhost:29595" } },
    { input: "https://127.0.0.1:8443", expected: { protocol: "https", host: "127.0.0.1:8443" } },
    { input: "http://[::1]:3000", expected: { protocol: "http", host: "[::1]:3000" } },
  ] as const)("accepts the host address $input", ({ input, expected }) => {
    expect(resolve(input)).toEqual(ok({ kind: "host", baseUrl: expected }));
  });

  it.each([
    // Not a Kontent.ai domain.
    { input: "evil.com" },
    { input: "evilkontent.ai" },
    { input: "kontent.ai.evil.com" },
    { input: "notdevkontentmasters.com" },
    { input: "" },
    // Subdomains: a domain is only ever one of the allowed domains themselves.
    { input: "eu-01.kontent.ai" },
    { input: "sub.devkontentmasters.com" },
    { input: "status.kontent.ai" },
    // A bare host carries no path; a host address carries no path either.
    { input: "kontent.ai/" },
    { input: "kontent.ai/path" },
    { input: "evil.com/kontent.ai" },
    { input: "http://localhost:29595/manageApi" },
    { input: "https://my-feature-draft.devkontentmasters.com/api" },
    // Plain http and ports only on this machine.
    { input: "http://kontent.ai" },
    { input: "https://kontent.ai:8080" },
    { input: "http://my-feature-draft.devkontentmasters.com" },
    { input: "https://my-feature-draft.devkontentmasters.com:8443" },
    { input: "https://example.com" },
    // A host address on an allowed domain other than an on-demand environment: a subdomain
    // can be served by a third party (status.kontent.ai is a hosted status page).
    { input: "https://status.kontent.ai" },
    { input: "https://eu-01.kontent.ai" },
    { input: "https://a.b-draft.devkontentmasters.com" },
    { input: "https://my-feature-draft.kontent.ai" },
    // The domain form written with a scheme.
    { input: "https://kontent.ai" },
    { input: "https://app.kontent.ai" },
    { input: "https://manage.devkontentmasters.com" },
    { input: "https://app.eu-01.kontent.ai" },
    // Raw IPs and DNS-to-loopback (SSRF PoC hosts).
    { input: "127.0.0.1" },
    { input: "169.254.169.254" },
    { input: "192.168.0.1" },
    { input: "127.0.0.1.nip.io" },
    { input: "kontent.ai.127.0.0.1.nip.io" },
    { input: "http://169.254.169.254" },
    { input: "http://127.0.0.1.nip.io" },
    { input: "http://localhost.evil.com" },
    // Non-standard port on a bare host.
    { input: "kontent.ai:8080" },
    { input: "sub.kontent.ai:22" },
    // Embedded credentials, including deceptive userinfo whose real host is allowed.
    { input: "user:pass@kontent.ai" },
    { input: "user@kontent.ai" },
    { input: "evil.com@kontent.ai" },
    { input: "http://user:pass@localhost:29595" },
    { input: "https://evil.com@kontent.ai" },
    // Query or fragment on a host address.
    { input: "http://localhost:29595/?x=1" },
    { input: "http://localhost:29595/#top" },
  ] as const)("rejects disallowed input $input", ({ input }) => {
    expect(resolve(input).kind).toBe("err");
  });
});

describe("derived API URLs", () => {
  it.each([
    {
      kontentUrl: "kontent.ai",
      app: { protocol: "https", host: "app.kontent.ai" },
      management: "https://manage.kontent.ai/v2",
    },
    {
      kontentUrl: "devkontentmasters.com",
      app: { protocol: "https", host: "app.devkontentmasters.com" },
      management: "https://manage.devkontentmasters.com/v2",
    },
    {
      kontentUrl: "https://my-feature-draft.devkontentmasters.com",
      app: { protocol: "https", host: "my-feature-draft.devkontentmasters.com" },
      management: "https://my-feature-draft.devkontentmasters.com/manageApi/v2",
    },
    {
      kontentUrl: "http://localhost:29595",
      app: { protocol: "http", host: "localhost:29595" },
      management: "http://localhost:29595/manageApi/v2",
    },
  ] as const)("KONTENT_URL=$kontentUrl", ({ kontentUrl, app, management }) => {
    expect(map(resolve(kontentUrl), iapiBaseUrl)).toEqual(ok(app));
    expect(map(resolve(kontentUrl), mapiBaseUrl)).toEqual(ok(management));
  });
});
