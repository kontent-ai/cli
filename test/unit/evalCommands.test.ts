import { describe, expect, it } from "vitest";
import type { Denial } from "../../evals/lib/agent.js";
import { collectCommands } from "../../evals/lib/commands.js";
import { assistantBash, bashResult, batchedBashResults } from "../helpers/sdkMessages.js";

describe("collectCommands", () => {
  it("pairs a Bash tool_use with its tool_result and classifies it ok", () => {
    const commands = collectCommands(
      [assistantBash("t1", "kontent auth status"), bashResult("t1", { stdout: "ok", stderr: "" })],
      [],
    );

    expect(commands).toEqual([
      {
        index: 0,
        command: "kontent auth status",
        outcome: "ok",
        exitCode: null,
        stdout: "ok",
        stderr: "",
        durationMs: null,
        isHelpLookup: false,
      },
    ]);
  });

  it("classifies a failed command from is_error", () => {
    const commands = collectCommands(
      [
        assistantBash("t1", "kontent content-type get --codename missing"),
        bashResult("t1", { stdout: "", stderr: "not found", isError: true }),
      ],
      [],
    );

    expect(commands[0]?.outcome).toBe("failed");
    expect(commands[0]?.stderr).toBe("not found");
  });

  it("classifies a command matching a denial by its text as denied, not failed", () => {
    const denials: ReadonlyArray<Denial> = [
      { toolName: "Bash", command: "cat /etc/passwd", reason: "outside scratch" },
    ];
    const commands = collectCommands([assistantBash("t1", "cat /etc/passwd")], denials);

    expect(commands[0]?.outcome).toBe("denied");
  });

  it("classifies a command with no matching tool_result as no-result, not failed", () => {
    const commands = collectCommands([assistantBash("t1", "kontent env list")], []);

    expect(commands[0]?.outcome).toBe("no-result");
  });

  it("builds each command's result from its own block when a message batches several tool_results", () => {
    const commands = collectCommands(
      [
        assistantBash("t1", "kontent auth status"),
        assistantBash("t2", "kontent env list"),
        batchedBashResults(
          [
            { toolUseId: "t1", content: "first output" },
            { toolUseId: "t2", content: "second output" },
          ],
          { stdout: "wrong shared stdout", stderr: "wrong shared stderr" },
        ),
      ],
      [],
    );

    expect(commands[0]?.stdout).toBe("first output");
    expect(commands[1]?.stdout).toBe("second output");
  });

  it.each([
    ["sort -h", false],
    ["kontent mapi -h", true],
    ["cd x && kontent docs search q", true],
    ["kontent content-type create --help", true],
    ["kontent -h", true],
    ["kontent content-type list", false],
  ])("classifies %s as help lookup: %s", (command, expected) => {
    const commands = collectCommands(
      [assistantBash("t1", command), bashResult("t1", { stdout: "", stderr: "" })],
      [],
    );

    expect(commands[0]?.isHelpLookup).toBe(expected);
  });
});
