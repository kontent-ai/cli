import { describe, expect, it } from "vitest";
import { buildTaskPrompt } from "../lib/prompt.js";

describe("buildTaskPrompt", () => {
  it("interpolates the env id and workspace dir, and appends the task body after a blank line", () => {
    const prompt = buildTaskPrompt({
      envId: "env-123",
      workspaceDir: "/tmp/workspace-abc",
      taskPrompt: "Do the thing.",
    });

    expect(prompt).toContain("env-123");
    expect(prompt).toContain("/tmp/workspace-abc");
    expect(prompt.endsWith("\n\nDo the thing.")).toBe(true);
  });
});
