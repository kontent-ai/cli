import { stripVTControlCharacters } from "node:util";
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";
import type { Telemetry } from "../../src/cli/adapters/telemetry/tracking.js";
import { authFailure, type CommandOutcome } from "../../src/cli/commands/shared/commandOutcome.js";
import type { ErrorReason } from "../../src/cli/commands/shared/exitCodes.js";
import { runCommand } from "../../src/cli/commands/shared/runCommand.js";
import type { CommandDeps } from "../../src/cli/types/yargs.js";
import type { AuthError } from "../../src/core/auth/types.js";
import type { EventProperties } from "../../src/core/telemetry/events.js";

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
  return { deps: { telemetry, kontentTarget: { kind: "domain", domain: "kontent.ai" } }, events };
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

// chalk colors the "Error:" prefix wherever it detects color support, CI included.
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
    ["cancelled", 2],
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

  it("tracks a throw as unexpected, exits 1 and reports it in one line", async () => {
    const events = await run("mapi", async () => Promise.reject(new Error("boom")));

    expect(events).toEqual([
      { command: "mapi", outcome: "error", errorCode: "unexpected", properties: undefined },
    ]);
    expect(process.exitCode).toBe(1);
    expect(stderrText()).toBe(
      "Error: Unexpected error: boom. Run again with --verbose for details.\n",
    );
  });

  it("shows the stack of a throw only under --verbose", async () => {
    const { deps } = recordingDeps();

    await runCommand({ trackAs: "mapi", args: { verbose: true }, deps }, async () =>
      Promise.reject(new Error("boom")),
    );

    expect(stderrText()).toContain("Unexpected error: boom.\nError: boom\n    at ");
    expect(stderrText()).not.toContain("--verbose");
  });

  it("adds no period after a message that already ends with one", async () => {
    await run("mapi", async () => Promise.reject(new Error("fetch failed.")));

    expect(stderrText()).toBe(
      "Error: Unexpected error: fetch failed. Run again with --verbose for details.\n",
    );
  });

  it("leaves out the --verbose hint when the throw carries no stack", async () => {
    await run("mapi", async () => Promise.reject("boom"));

    expect(stderrText()).toBe("Error: Unexpected error: boom.\n");
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

describe("authFailure", () => {
  it.each<readonly [AuthError, ErrorReason]>([
    [{ kind: "not-logged-in" }, "auth-required"],
    [{ kind: "storage-read-failed", cause: null }, "failure"],
  ])("maps %o to %s", (error, reason) => {
    expect(authFailure(error, { project: "p-1" })).toEqual({
      status: "error",
      reason,
      errorCode: `auth:${error.kind}`,
      properties: { project: "p-1" },
    });
  });
});
