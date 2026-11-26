import { stripVTControlCharacters } from "node:util";
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";
import type { Telemetry } from "../../src/cli/adapters/telemetry/tracking.js";
import type { CommandOutcome } from "../../src/cli/commands/shared/commandOutcome.js";
import { runCommand } from "../../src/cli/commands/shared/runCommand.js";
import type { CommandDeps } from "../../src/cli/types/yargs.js";
import type { ErrorReason } from "../../src/core/lib/exitCodes.js";
import type { EventProperties } from "../../src/core/telemetry/events.js";
import { commandDeps } from "../helpers/commandDeps.js";

type TrackedEvent =
  | Readonly<{ command: string; outcome: "success"; properties: EventProperties | undefined }>
  | Readonly<{
      command: string;
      outcome: "error";
      errorCode: string;
      properties: EventProperties | undefined;
    }>;

const recordingDeps = (): Readonly<{ deps: CommandDeps; events: ReadonlyArray<TrackedEvent> }> => {
  const events: TrackedEvent[] = [];
  const telemetry: Telemetry = {
    startCommandTracking: (command) => ({
      succeed: (properties) => {
        events.push({ command, outcome: "success", properties });
      },
      fail: (errorCode, properties) => {
        events.push({ command, outcome: "error", errorCode, properties });
      },
    }),
    flush: async () => {},
  };
  return { deps: commandDeps({ telemetry }), events };
};

const run = async (
  trackAs: string | null,
  outcome: () => Promise<CommandOutcome>,
): Promise<ReadonlyArray<TrackedEvent>> => {
  const { deps, events } = recordingDeps();
  await runCommand({ trackAs, args: {}, deps }, outcome);
  return events;
};

// runCommand logs to process.stderr and sets process.exitCode, which vitest itself reads.
let stderrWrite: MockInstance<typeof process.stderr.write>;

beforeEach(() => {
  stderrWrite = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});

afterEach(() => {
  stderrWrite.mockRestore();
  process.exitCode = undefined;
});

// styleStderr colors the "Error:" prefix when stderr is a color terminal or FORCE_COLOR is set.
const stderrText = (): string =>
  stripVTControlCharacters(stderrWrite.mock.calls.map(([chunk]) => String(chunk)).join(""));

describe("runCommand", () => {
  it("tracks a success with its properties and exits 0", async () => {
    const events = await run("login", async () => ({
      status: "success",
      properties: { project: "p-1" },
    }));

    expect(events).toEqual([
      { command: "login", outcome: "success", properties: { project: "p-1" } },
    ]);
    expect(process.exitCode).toBe(0);
  });

  it.each<readonly [ErrorReason, number]>([
    ["failure", 1],
    ["cancelled", 130],
    ["auth-required", 4],
  ])("exits with the code of the %s reason", async (reason, exitCode) => {
    const events = await run("dapi", async () => ({
      status: "error",
      reason,
      errorCode: "some-code",
    }));

    expect(events).toEqual([
      { command: "dapi", outcome: "error", errorCode: "some-code", properties: undefined },
    ]);
    expect(process.exitCode).toBe(exitCode);
  });

  it.each<readonly [string, unknown, string]>([
    [
      "an error",
      new Error("boom"),
      "Error: Unexpected error: boom. Run again with --verbose for details.\n",
    ],
    [
      "a message that already ends with a period",
      new Error("fetch failed."),
      "Error: Unexpected error: fetch failed. Run again with --verbose for details.\n",
    ],
    ["a throw without a stack", "boom", "Error: Unexpected error: boom.\n"],
  ])("tracks %s thrown as unexpected, exits 1 and reports it in one line", async (_, thrown, expected) => {
    const events = await run("mapi", async () => Promise.reject(thrown));

    expect(events).toEqual([
      { command: "mapi", outcome: "error", errorCode: "unexpected", properties: undefined },
    ]);
    expect(process.exitCode).toBe(1);
    expect(stderrText()).toBe(expected);
  });

  it("shows the stack of a throw only under --verbose", async () => {
    const { deps } = recordingDeps();

    await runCommand({ trackAs: "mapi", args: { verbose: true }, deps }, async () =>
      Promise.reject(new Error("boom")),
    );

    expect(stderrText()).toContain("Unexpected error: boom.\nError: boom\n    at ");
    expect(stderrText()).not.toContain("--verbose");
  });

  it("sends nothing for an untracked command, but still sets the exit code", async () => {
    const events = await run(null, async () => ({
      status: "error",
      reason: "failure",
      errorCode: "config-write-failed",
    }));

    expect(events).toEqual([]);
    expect(process.exitCode).toBe(1);
  });
});
