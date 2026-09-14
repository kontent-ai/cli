import { describe, expect, it } from "vitest";
import { buildTaskPrompt } from "../../evals/lib/prompt.js";

describe("buildTaskPrompt", () => {
  it("substitutes every placeholder occurrence and appends the task body after a blank line", () => {
    const prompt = buildTaskPrompt({
      preamble: "Env is {{ENV_ID}}. Work inside {{SCRATCH_DIR}}. Never leave {{SCRATCH_DIR}}.",
      envId: "env-123",
      scratchDir: "/tmp/scratch-abc",
      taskPrompt: "Do the thing.",
    });

    expect(prompt).toBe(
      "Env is env-123. Work inside /tmp/scratch-abc. Never leave /tmp/scratch-abc.\n\nDo the thing.",
    );
  });

  it("leaves a preamble with no placeholders untouched apart from the appended body", () => {
    const prompt = buildTaskPrompt({
      preamble: "Static preamble.",
      envId: "env-123",
      scratchDir: "/tmp/scratch",
      taskPrompt: "Body.",
    });

    expect(prompt).toBe("Static preamble.\n\nBody.");
  });
});
