import { describe, expect, it } from "vitest";
import type { Auth0Settings } from "../../src/core/auth/loginContext.js";
import { type KontentTarget, resolveKontentTarget } from "../../src/core/kontentUrl/kontentUrl.js";
import { none, some } from "../../src/core/lib/option.js";
import { isErr, ok } from "../../src/core/lib/result.js";
import type { Overrides } from "../../src/core/overrides/overrides.js";
import { type RunContext, resolveRunContext } from "../../src/core/overrides/runContext.js";

const RELEASE_AUTH0: Auth0Settings = {
  domain: "login.example.com",
  clientId: "client",
  audience: "https://api.example.com/",
};
const DEV_AUTH0: Auth0Settings = {
  domain: "login.qa.example.com",
  clientId: "qa-client",
  audience: "https://api.qa.example.com/",
};
const UNBUILT_AUTH0: Auth0Settings = { domain: "", clientId: "", audience: "" };

const PRODUCTION: KontentTarget = { kind: "domain", domain: "kontent.ai" };
const host = (protocol: "http" | "https", name: string): KontentTarget => ({
  kind: "host",
  baseUrl: { protocol, host: name },
});
const LOCAL = host("http", "localhost:3000");

const NO_OVERRIDES: Overrides = { kontentTarget: none, auth0: [] };

type Inputs = Parameters<typeof resolveRunContext>[0];

const release = (inputs: Partial<Inputs> = {}): Inputs => ({
  kontentUrl: undefined,
  bakedKontentUrl: undefined,
  auth0: RELEASE_AUTH0,
  builtInAuth0: RELEASE_AUTH0,
  ...inputs,
});
const devBuild = (inputs: Partial<Inputs> = {}): Inputs => ({
  kontentUrl: undefined,
  bakedKontentUrl: "http://localhost:3000",
  auth0: DEV_AUTH0,
  builtInAuth0: DEV_AUTH0,
  ...inputs,
});
const unbuilt = (inputs: Partial<Inputs> = {}): Inputs => ({
  kontentUrl: undefined,
  bakedKontentUrl: undefined,
  auth0: UNBUILT_AUTH0,
  builtInAuth0: UNBUILT_AUTH0,
  ...inputs,
});

describe("resolveRunContext", () => {
  it.each<readonly [string, Inputs, RunContext]>([
    [
      "a release build",
      release(),
      { target: PRODUCTION, overrides: NO_OVERRIDES, configFolder: "cli" },
    ],
    [
      "an empty baked KONTENT_URL",
      release({ bakedKontentUrl: "" }),
      { target: PRODUCTION, overrides: NO_OVERRIDES, configFolder: "cli" },
    ],
    [
      "KONTENT_URL=kontent.ai on a release build",
      release({ kontentUrl: "kontent.ai" }),
      { target: PRODUCTION, overrides: NO_OVERRIDES, configFolder: "cli" },
    ],
    [
      "a local KONTENT_URL",
      release({ kontentUrl: "http://localhost:3000" }),
      {
        target: LOCAL,
        overrides: { kontentTarget: some(LOCAL), auth0: [] },
        configFolder: "cli-localhost_3000",
      },
    ],
    [
      "a local KONTENT_URL with an Auth0 override",
      release({
        kontentUrl: "http://localhost:3000",
        auth0: { ...RELEASE_AUTH0, domain: "login.qa.example.com" },
      }),
      {
        target: LOCAL,
        overrides: {
          kontentTarget: some(LOCAL),
          auth0: ["domain"],
        },
        configFolder: "cli-localhost_3000",
      },
    ],
    [
      "only the client ID on a release build",
      release({ auth0: { ...RELEASE_AUTH0, clientId: "qa-client" } }),
      {
        target: PRODUCTION,
        overrides: { kontentTarget: none, auth0: ["clientId"] },
        configFolder: "cli-login.example.com",
      },
    ],
    [
      "an Auth0 domain that differs only in case",
      release({ auth0: { ...RELEASE_AUTH0, domain: "LOGIN.example.com" } }),
      {
        target: PRODUCTION,
        overrides: {
          kontentTarget: none,
          auth0: ["domain"],
        },
        configFolder: "cli-LOGIN.example.com",
      },
    ],
    [
      "a dev build with no variables",
      devBuild(),
      { target: LOCAL, overrides: NO_OVERRIDES, configFolder: "cli-localhost_3000" },
    ],
    [
      "KONTENT_URL=kontent.ai on a dev build",
      devBuild({ kontentUrl: "kontent.ai" }),
      {
        target: PRODUCTION,
        overrides: { kontentTarget: some(PRODUCTION), auth0: [] },
        configFolder: "cli-login.qa.example.com",
      },
    ],
    [
      "another scheme for the dev build's host",
      devBuild({ kontentUrl: "https://localhost:3000" }),
      {
        target: host("https", "localhost:3000"),
        overrides: { kontentTarget: some(host("https", "localhost:3000")), auth0: [] },
        configFolder: "cli-localhost_3000",
      },
    ],
    [
      "an unbuilt run with no variables",
      unbuilt(),
      { target: PRODUCTION, overrides: NO_OVERRIDES, configFolder: "cli" },
    ],
    [
      "an unbuilt run with only a client ID",
      unbuilt({ auth0: { ...UNBUILT_AUTH0, clientId: "qa-client" } }),
      {
        target: PRODUCTION,
        overrides: { kontentTarget: none, auth0: ["clientId"] },
        configFolder: "cli-custom-login",
      },
    ],
    [
      "an invalid built-in KONTENT_URL overridden by a valid one",
      release({ kontentUrl: "kontent.ai", bakedKontentUrl: "example.com" }),
      {
        target: PRODUCTION,
        overrides: { kontentTarget: some(PRODUCTION), auth0: [] },
        configFolder: "cli-login.example.com",
      },
    ],
  ])("%s", (_, inputs, expected) => {
    expect(resolveRunContext(inputs)).toEqual(ok(expected));
  });

  it.each<readonly [string, string]>([
    ["http://127.0.0.1", "cli-127.0.0.1"],
    ["http://[::1]:8080", "cli-___1__8080"],
    ["https://my-env-draft.devkontentmasters.com", "cli-my-env-draft.devkontentmasters.com"],
  ])("names the folder of %s %s", (kontentUrl, folder) => {
    const context = resolveRunContext(release({ kontentUrl }));

    expect(context).toEqual(ok(expect.objectContaining({ configFolder: folder })));
  });

  it("replaces characters a folder name cannot hold in an Auth0 domain", () => {
    const context = resolveRunContext(
      release({ auth0: { ...RELEASE_AUTH0, domain: "login.example.com:443/x" } }),
    );

    expect(context).toEqual(
      ok(expect.objectContaining({ configFolder: "cli-login.example.com_443_x" })),
    );
  });

  it.each<readonly [string, Inputs, string]>([
    ["an invalid KONTENT_URL", release({ kontentUrl: "example.com" }), "example.com"],
    [
      "an invalid built-in KONTENT_URL alone",
      release({ bakedKontentUrl: "example.com" }),
      "example.com",
    ],
  ])("fails on %s with the KONTENT_URL message", (_, inputs, raw) => {
    const expected = resolveKontentTarget({ fromEnv: raw, baked: undefined });

    expect(isErr(expected)).toBe(true);
    expect(resolveRunContext(inputs)).toEqual(expected);
  });
});
