import { describe, expect, it } from "vitest";
import { validateKontentDomain } from "../../src/lib/config/kontentUrl.js";

describe("validateKontentDomain", () => {
  it.each([
    { input: "kontent.ai" },
    { input: "eu-01.kontent.ai" },
    { input: "devkontentmasters.com" },
    { input: "sub.devkontentmasters.com" },
  ] as const)("accepts allowed bare host $input", ({ input }) => {
    const result = validateKontentDomain(input);
    expect(result).toEqual({ kind: "ok", value: input });
  });

  it.each([
    // Not a Kontent.ai domain.
    { input: "evil.com" },
    { input: "evilkontent.ai" },
    { input: "kontent.ai.evil.com" },
    { input: "notdevkontentmasters.com" },
    { input: "" },
    // Scheme / path / deceptive host — the value must be a bare host.
    { input: "https://kontent.ai" },
    { input: "http://kontent.ai" },
    { input: "kontent.ai/" },
    { input: "kontent.ai/path" },
    { input: "evil.com/kontent.ai" },
    // Raw IPs and DNS-to-loopback (SSRF PoC hosts).
    { input: "127.0.0.1" },
    { input: "169.254.169.254" },
    { input: "192.168.0.1" },
    { input: "127.0.0.1.nip.io" },
    { input: "kontent.ai.127.0.0.1.nip.io" },
    // Non-standard port.
    { input: "kontent.ai:8080" },
    { input: "sub.kontent.ai:22" },
    // Embedded credentials, including deceptive userinfo whose real host is allowed.
    { input: "user:pass@kontent.ai" },
    { input: "user@kontent.ai" },
    { input: "evil.com@kontent.ai" },
  ] as const)("rejects disallowed input $input", ({ input }) => {
    expect(validateKontentDomain(input).kind).toBe("err");
  });
});
