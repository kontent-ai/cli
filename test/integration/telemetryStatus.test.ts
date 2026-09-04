import { describe, expect, it, vi } from "vitest";
import yargs from "yargs";
import { register } from "../../src/commands/telemetry/status.js";
import { noopTelemetry } from "../../src/lib/telemetry/tracking.js";
import { addLogLevelOptions } from "../../src/log.js";

vi.mock("../../src/lib/config/cliConfig.js", () => ({
  readCliConfig: vi.fn(async () => ({ telemetryEnabled: true, telemetryNoticeShown: true })),
  getCliConfigPath: () => "/tmp/kontent/config.json",
}));

vi.mock("ci-info", () => ({ isCI: false }));

// A build without an Amplitude key reports telemetry off whatever the config says.
vi.mock("../../src/lib/telemetry/context.js", () => ({
  amplitudeApiKey: "test-key",
  cliVersion: "0.0.0-test",
}));

const runStatus = async (argv: ReadonlyArray<string>) => {
  const streams = { stdout: "", stderr: "" };
  const capture = (key: "stdout" | "stderr") =>
    vi.spyOn(process[key], "write").mockImplementation((chunk) => {
      streams[key] += String(chunk);
      return true;
    });
  const spies = [capture("stdout"), capture("stderr")];

  try {
    await register(
      addLogLevelOptions(
        yargs([...argv])
          .strict()
          .exitProcess(false),
      ),
      {
        telemetry: noopTelemetry,
      },
    ).parseAsync([...argv]);
  } finally {
    for (const spy of spies) {
      spy.mockRestore();
    }
  }
  return streams;
};

describe("kontent telemetry status", () => {
  it("writes the report to stdout, not stderr", async () => {
    const { stdout, stderr } = await runStatus(["status"]);

    expect(stdout).toContain("Telemetry: enabled");
    expect(stdout).toContain("Reason: enabled in the config file");
    expect(stdout).toContain("Config file: /tmp/kontent/config.json");
    expect(stderr).toBe("");
  });

  // The report is the command's payload, so --logLevel must not be able to mute it.
  it("still writes the report at --logLevel none", async () => {
    const { stdout } = await runStatus(["status", "--logLevel", "none"]);

    expect(stdout).toContain("Telemetry: enabled");
  });
});
