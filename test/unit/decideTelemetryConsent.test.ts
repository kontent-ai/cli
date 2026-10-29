import { describe, expect, it } from "vitest";
import { type ConsentInputs, decideTelemetryConsent } from "../../src/core/telemetry/consent.js";

const KEY = "amplitude-key";

const consentFor = (inputs: Partial<ConsentInputs>) =>
  decideTelemetryConsent({
    optOutVariables: { doNotTrack: undefined, kontentDoNotTrack: undefined },
    telemetryEnabled: undefined,
    amplitudeApiKey: KEY,
    isCiRun: false,
    ...inputs,
  });

describe("decideTelemetryConsent", () => {
  it("DO_NOT_TRACK wins over an enabled config", () => {
    const optOutVariables = { doNotTrack: "1", kontentDoNotTrack: "1" };

    expect(consentFor({ optOutVariables, telemetryEnabled: true })).toEqual({
      isEnabled: false,
      reason: "do-not-track-env",
    });
  });

  it("KONTENT_DO_NOT_TRACK opts out", () => {
    expect(
      consentFor({ optOutVariables: { doNotTrack: undefined, kontentDoNotTrack: "1" } }),
    ).toEqual({
      isEnabled: false,
      reason: "kontent-do-not-track-env",
    });
  });

  it("a disabled config wins over CI", () => {
    expect(consentFor({ telemetryEnabled: false, isCiRun: true })).toEqual({
      isEnabled: false,
      reason: "config-disabled",
    });
  });

  it("CI turns it off", () => {
    expect(consentFor({ isCiRun: true })).toEqual({ isEnabled: false, reason: "ci" });
  });

  it("a build without an API key turns it off", () => {
    expect(consentFor({ telemetryEnabled: true, amplitudeApiKey: "" })).toEqual({
      isEnabled: false,
      reason: "missing-api-key",
    });
  });

  it("is enabled when nothing opts out", () => {
    expect(consentFor({})).toEqual({ isEnabled: true });
  });
});
