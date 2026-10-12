import { afterEach, describe, expect, it, vi } from "vitest";
import {
  kontentAppBaseUrl,
  kontentManagementUrl,
  validateKontentUrl,
} from "../../src/lib/config/kontentUrl.js";

describe("validateKontentUrl", () => {
  it.each([
    { input: "kontent.ai" },
    { input: "eu-01.kontent.ai" },
    { input: "devkontentmasters.com" },
    { input: "sub.devkontentmasters.com" },
  ] as const)("accepts allowed bare host $input", ({ input }) => {
    const result = validateKontentUrl(input);
    expect(result).toEqual({ kind: "ok", value: { kind: "domain", domain: input } });
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
    const result = validateKontentUrl(input);
    expect(result).toEqual({ kind: "ok", value: { kind: "host", ...expected } });
  });

  it.each([
    // Not a Kontent.ai domain.
    { input: "evil.com" },
    { input: "evilkontent.ai" },
    { input: "kontent.ai.evil.com" },
    { input: "notdevkontentmasters.com" },
    { input: "" },
    // A bare host carries no path; a host address carries no path either.
    { input: "kontent.ai/" },
    { input: "kontent.ai/path" },
    { input: "evil.com/kontent.ai" },
    { input: "http://localhost:29595/manageApi" },
    { input: "https://my-feature-draft.devkontentmasters.com/api" },
    // Plain http and ports only on this machine.
    { input: "http://kontent.ai" },
    { input: "https://kontent.ai:8080" },
    { input: "https://example.com" },
    // The domain form written with a scheme: these hosts serve the two APIs separately.
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
    expect(validateKontentUrl(input).kind).toBe("err");
  });

  it.each([
    { input: "https://kontent.ai", domain: "kontent.ai" },
    { input: "https://app.kontent.ai", domain: "kontent.ai" },
    { input: "https://manage.devkontentmasters.com", domain: "devkontentmasters.com" },
  ] as const)("points $input to the domain form", ({ input, domain }) => {
    expect(validateKontentUrl(input)).toEqual({
      kind: "err",
      error: expect.stringContaining(`Set KONTENT_URL=${domain}`),
    });
  });
});

describe("derived API URLs", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

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
    vi.stubEnv("KONTENT_URL", kontentUrl);

    expect(kontentAppBaseUrl()).toEqual(app);
    expect(kontentManagementUrl()).toBe(management);
  });
});
