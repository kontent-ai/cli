import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { writeTaskResult } from "../../evals/lib/results.js";
import { buildTaskTrace } from "../../evals/lib/transcript.js";

const emptyTrace = buildTaskTrace({
  messages: [],
  denials: [],
  stderr: "",
  stopReason: "completed",
});

describe("writeTaskResult redaction", () => {
  it("redacts every occurrence of the secret from the written task files", async () => {
    const runDir = await mkdtemp(join(tmpdir(), "kontent-eval-results-"));
    await mkdir(join(runDir, "tasks"));
    const mapiKey = "abc123";

    await writeTaskResult(
      runDir,
      "task",
      {
        trace: emptyTrace,
        run: undefined,
        verdict: "ERROR",
        assertions: [],
        errorMessage: `key=${mapiKey} again ${mapiKey}`,
      },
      mapiKey,
    );

    const json = await readFile(join(runDir, "tasks/task.json"), "utf8");
    const markdown = await readFile(join(runDir, "tasks/task.md"), "utf8");

    expect(json).toContain("[REDACTED]");
    expect(json).not.toContain(mapiKey);
    expect(markdown).toContain("[REDACTED]");
    expect(markdown).not.toContain(mapiKey);
  });

  it("leaves the written task files untouched for an empty secret", async () => {
    const runDir = await mkdtemp(join(tmpdir(), "kontent-eval-results-"));
    await mkdir(join(runDir, "tasks"));
    const errorMessage = "nothing sensitive here";

    await writeTaskResult(
      runDir,
      "task",
      { trace: emptyTrace, run: undefined, verdict: "ERROR", assertions: [], errorMessage },
      "",
    );

    const json = await readFile(join(runDir, "tasks/task.json"), "utf8");
    expect(json).toContain(errorMessage);
  });
});
