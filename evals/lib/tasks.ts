import { err, ok, type Result } from "../../src/lib/result.js";

export type TaskNode = Readonly<{ id: string; dependsOn: ReadonlyArray<string> }>;

// A flat topological order: every task appears after all of its parents.
// Among tasks that become ready at the same point, input order is preserved,
// so the order is deterministic and reproducible across runs.
export const resolveExecutionOrder = <T extends TaskNode>(
  tasks: ReadonlyArray<T>,
): Result<ReadonlyArray<T>, string> => {
  const duplicates = tasks
    .map((task) => task.id)
    .filter((id, index, ids) => ids.indexOf(id) !== index);
  if (duplicates.length > 0) {
    return err(`Duplicate task ids: ${[...new Set(duplicates)].sort().join(", ")}.`);
  }

  const byId = new Map(tasks.map((task) => [task.id, task] as const));
  const unknown = tasks.flatMap((task) =>
    task.dependsOn
      .filter((dependency) => !byId.has(dependency))
      .map((dependency) => `${task.id} -> ${dependency}`),
  );
  if (unknown.length > 0) {
    return err(`Unknown dependencies: ${unknown.join(", ")}.`);
  }

  return buildOrder(tasks, new Set(), []);
};

const buildOrder = <T extends TaskNode>(
  remaining: ReadonlyArray<T>,
  placed: ReadonlySet<string>,
  ordered: ReadonlyArray<T>,
): Result<ReadonlyArray<T>, string> => {
  if (remaining.length === 0) {
    return ok(ordered);
  }

  const ready = remaining.filter((task) =>
    task.dependsOn.every((dependency) => placed.has(dependency)),
  );
  if (ready.length === 0) {
    const stuck = remaining
      .map((task) => task.id)
      .sort()
      .join(", ");
    return err(`Dependency cycle between tasks: ${stuck}.`);
  }

  return buildOrder(
    remaining.filter((task) => !ready.includes(task)),
    new Set([...placed, ...ready.map((task) => task.id)]),
    [...ordered, ...ready],
  );
};
