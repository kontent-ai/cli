import { describe, expect, it } from "vitest";
import { DENIAL_PREFIX } from "../lib/policy.js";
import { collectToolCalls } from "../lib/toolCalls.js";
import {
  createAssistantBash,
  createAssistantWebFetch,
  createBashResult,
  createBatchedBashResults,
  createDeniedResult,
  createResultMessage,
  createWebFetchResult,
} from "./helpers/sdkMessages.js";

describe("collectToolCalls", () => {
  it("pairs a Bash tool_use with its tool_result and classifies it ok", () => {
    const calls = collectToolCalls([
      createAssistantBash("t1", "kontent auth status"),
      createBashResult("t1", { stdout: "ok", stderr: "" }),
    ]);

    expect(calls).toEqual([
      {
        index: 0,
        tool: "Bash",
        command: "kontent auth status",
        fetchPrompt: "",
        outcome: "ok",
        stdout: "ok",
        stderr: "",
        durationMs: null,
      },
    ]);
  });

  it("records a WebFetch tool_use as a call with its url, prompt, summary and timing", () => {
    const calls = collectToolCalls([
      createAssistantWebFetch("t1", "https://kontent.ai/learn/x", "how do I add a term"),
      createWebFetchResult("t1", { result: "POST /taxonomies with terms[]", durationMs: 2400 }),
    ]);

    expect(calls).toEqual([
      {
        index: 0,
        tool: "WebFetch",
        command: "https://kontent.ai/learn/x",
        fetchPrompt: "how do I add a term",
        outcome: "ok",
        stdout: "POST /taxonomies with terms[]",
        stderr: "",
        durationMs: 2400,
      },
    ]);
  });

  it("classifies a Bash call the hook denied as denied, with the reason in stderr", () => {
    const calls = collectToolCalls([
      createAssistantBash("t1", "cat /etc/passwd"),
      createDeniedResult("t1", "command references a path outside the workspace: /etc/passwd"),
    ]);

    expect(calls[0]?.outcome).toBe("denied");
    expect(calls[0]?.stderr).toBe(
      `${DENIAL_PREFIX}command references a path outside the workspace: /etc/passwd`,
    );
    expect(calls[0]?.stdout).toBe("");
  });

  it("classifies a call listed only in permission_denials as denied, matched by tool_use_id", () => {
    const calls = collectToolCalls([
      createAssistantWebFetch("t1", "https://kontent.ai/learn", "what is the request body shape"),
      createWebFetchResult("t1", { result: "first" }),
      createAssistantWebFetch("t2", "https://kontent.ai/learn", "what is the request body shape"),
      createResultMessage({
        permissionDenials: [
          {
            tool_name: "WebFetch",
            tool_use_id: "t2",
            tool_input: { url: "https://kontent.ai/learn" },
          },
        ],
      }),
    ]);

    // The earlier fetch to the same url stays ok: denials are keyed by id, not by url.
    expect(calls[0]?.outcome).toBe("ok");
    expect(calls[1]?.outcome).toBe("denied");
    expect(calls[1]?.stderr).toBe("not pre-approved by the permission rules");
  });

  it("classifies a failed command from is_error", () => {
    const calls = collectToolCalls([
      createAssistantBash("t1", "kontent content-type get --codename missing"),
      createBashResult("t1", { stdout: "", stderr: "not found", isError: true }),
    ]);

    expect(calls[0]?.outcome).toBe("failed");
    expect(calls[0]?.stderr).toBe("not found");
  });

  it("classifies a call with no matching tool_result as no-result, not failed", () => {
    const calls = collectToolCalls([createAssistantBash("t1", "kontent env list")]);

    expect(calls[0]?.outcome).toBe("no-result");
  });

  it("builds each call's result from its own block when a message batches several tool_results", () => {
    const calls = collectToolCalls([
      createAssistantBash("t1", "kontent auth status"),
      createAssistantBash("t2", "kontent env list"),
      createBatchedBashResults(
        [
          { toolUseId: "t1", content: "first output" },
          { toolUseId: "t2", content: "second output" },
        ],
        { stdout: "wrong shared stdout", stderr: "wrong shared stderr" },
      ),
    ]);

    expect(calls[0]?.stdout).toBe("first output");
    expect(calls[1]?.stdout).toBe("second output");
  });
});
