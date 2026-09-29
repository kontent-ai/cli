import { describe, expect, it } from "vitest";
import { buildTaskPrompt } from "../lib/prompt.js";

describe("buildTaskPrompt", () => {
  it("interpolates the workspace dir, and appends the task body after a blank line", () => {
    const prompt = buildTaskPrompt({
      workspaceDir: "/tmp/workspace-abc",
      taskPrompt: "Do the thing.",
    });

    expect(prompt).toContain("/tmp/workspace-abc");
    expect(prompt.endsWith("\n\nDo the thing.")).toBe(true);
  });
});
