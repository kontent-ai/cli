import { describe, expect, it } from "vitest";
import { assertErr, assertOk } from "../../test/helpers/assertResult.js";
import { resolveExecutionOrder } from "../lib/tasks.js";

describe("resolveExecutionOrder", () => {
  it("puts independent tasks first, in input order", () => {
    const result = resolveExecutionOrder([
      { id: "a", dependsOn: [] },
      { id: "b", dependsOn: [] },
    ]);

    assertOk(result);
    expect(result.value).toEqual([
      { id: "a", dependsOn: [] },
      { id: "b", dependsOn: [] },
    ]);
  });

  it("orders a linear chain so every task follows its parent", () => {
    const result = resolveExecutionOrder([
      { id: "c", dependsOn: ["b"] },
      { id: "b", dependsOn: ["a"] },
      { id: "a", dependsOn: [] },
    ]);

    assertOk(result);
    expect(result.value.map((task) => task.id)).toEqual(["a", "b", "c"]);
  });

  it("keeps two independent roots and their chains apart, deterministically", () => {
    const result = resolveExecutionOrder([
      { id: "b1", dependsOn: ["a"] },
      { id: "a", dependsOn: [] },
      { id: "b2", dependsOn: ["d"] },
      { id: "d", dependsOn: [] },
    ]);

    assertOk(result);
    expect(result.value.map((task) => task.id)).toEqual(["a", "d", "b1", "b2"]);
  });

  it("orders a task with two parents after both of them", () => {
    const result = resolveExecutionOrder([
      { id: "c", dependsOn: ["a", "b"] },
      { id: "a", dependsOn: [] },
      { id: "b", dependsOn: [] },
    ]);

    assertOk(result);
    expect(result.value.map((task) => task.id)).toEqual(["a", "b", "c"]);
  });

  it("reports a cycle instead of looping", () => {
    const result = resolveExecutionOrder([
      { id: "a", dependsOn: ["b"] },
      { id: "b", dependsOn: ["a"] },
    ]);

    assertErr(result);
    expect(result.error).toContain("cycle");
    expect(result.error).toContain("a, b");
  });

  it("reports a task that depends on itself", () => {
    assertErr(resolveExecutionOrder([{ id: "a", dependsOn: ["a"] }]));
  });

  it("reports an unknown dependency", () => {
    const result = resolveExecutionOrder([{ id: "a", dependsOn: ["missing"] }]);

    assertErr(result);
    expect(result.error).toContain("a -> missing");
  });

  it("reports duplicate ids", () => {
    const result = resolveExecutionOrder([
      { id: "a", dependsOn: [] },
      { id: "a", dependsOn: [] },
    ]);

    assertErr(result);
    expect(result.error).toContain("Duplicate task ids: a");
  });
});
