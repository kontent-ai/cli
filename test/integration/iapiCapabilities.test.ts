import { describe, expect, it } from "vitest";
import { createDeliveryKeys } from "../../src/cli/adapters/iapi/deliveryKeys.js";
import { createProjects } from "../../src/cli/adapters/iapi/projects.js";
import { planDeliveryKeyRequest } from "../../src/core/project/deliveryKeyRequest.js";
import { assertOk } from "../helpers/assertResult.js";
import { iapiTestClient } from "../helpers/iapiTestClient.js";

describe("IAPI capabilities", () => {
  it("reads the project and its properties", async () => {
    const projects = createProjects(
      iapiTestClient([
        {
          method: "GET",
          path: /\/project-management\//,
          reply: { projectName: "My Project", projectContainerId: "c-1", subscriptionId: "sub-1" },
        },
        {
          method: "GET",
          path: /\/property$/,
          reply: [{ key: "SampleProjectType", value: "Kickstart" }],
        },
      ]),
    );

    const info = await projects.info("env-1");
    const properties = await projects.properties("env-1");

    assertOk(info);
    expect(info.value).toMatchObject({ projectName: "My Project", projectContainerId: "c-1" });
    assertOk(properties);
    expect(properties.value).toEqual([{ key: "SampleProjectType", value: "Kickstart" }]);
  });

  it("lists, reads and creates delivery keys", async () => {
    const deliveryKeys = createDeliveryKeys(
      iapiTestClient([
        {
          method: "POST",
          path: /\/keys\/listing$/,
          reply: [{ token_seed_id: "seed-123", name: "My Key", expires_at: "2030-01-01" }],
        },
        { method: "GET", path: /\/keys\/[^/]+$/, reply: { api_key: "delivery-secret-abc" } },
        { method: "POST", path: /\/keys$/, reply: { api_key: "new-secret-xyz", name: "new key" } },
      ]),
    );

    const listed = await deliveryKeys.list("c-1", "env-1");
    const apiKey = await deliveryKeys.viewApiKey("c-1", "seed-123");
    const created = await deliveryKeys.create("c-1", planDeliveryKeyRequest("env-1", 0));

    expect(listed).toEqual({
      kind: "ok",
      value: [{ tokenSeedId: "seed-123", name: "My Key", expiresAt: "2030-01-01" }],
    });
    expect(apiKey).toEqual({ kind: "ok", value: "delivery-secret-abc" });
    expect(created).toEqual({ kind: "ok", value: { name: "new key", apiKey: "new-secret-xyz" } });
  });
});
