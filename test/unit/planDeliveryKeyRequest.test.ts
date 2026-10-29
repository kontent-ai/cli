import { describe, expect, it } from "vitest";
import { planDeliveryKeyRequest } from "../../src/core/project/deliveryKeyRequest.js";

describe("planDeliveryKeyRequest", () => {
  it("asks for a dated preview key on one environment, valid for a year", () => {
    const request = planDeliveryKeyRequest("env-1", Date.UTC(2026, 0, 15, 10, 30));

    expect(request).toEqual({
      name: "Delivery key — CLI bootstrap (2026-01-15)",
      environments: ["env-1"],
      hasPreviewDeliveryAccess: true,
      expiresAt: new Date(Date.UTC(2027, 0, 15, 10, 30)),
    });
  });
});
