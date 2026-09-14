import { isErr, ok } from "../../../src/lib/result.js";
import { DEFAULT_CODENAME } from "../../lib/codenames.js";
import { describeList, lookup } from "../../lib/inspect.js";
import type { EvalTask } from "../../lib/types.js";

export const workflowAndCollection: EvalTask = {
  id: "workflow-and-collection",
  dependsOn: [],
  prompt:
    "Content should go through a review before anyone publishes it, so set up a new workflow with a step called Review, codename review. We also want a separate collection called Blog, codename blog.",
  check: async (client) => {
    const workflows = await lookup("Listing workflows", () => client.listWorkflows().toPromise());
    if (isErr(workflows)) {
      return workflows;
    }

    const collections = await lookup("Listing collections", () =>
      client.listCollections().toPromise(),
    );
    if (isErr(collections)) {
      return collections;
    }

    const allWorkflows = workflows.value.data;
    const allCollections = collections.value.data.collections;

    const addedWorkflows = allWorkflows.filter(
      (workflow) => workflow.codename !== DEFAULT_CODENAME,
    );
    const reviewWorkflow = addedWorkflows.find((workflow) =>
      workflow.steps.some((step) => step.codename === "review"),
    );
    const blogCollection = allCollections.find((collection) => collection.codename === "blog");

    return ok([
      {
        id: "new-workflow-exists",
        passed: addedWorkflows.length > 0,
        evidence: `workflow codenames: ${describeList(allWorkflows.map((workflow) => workflow.codename))}`,
      },
      {
        id: "new-workflow-has-review-step",
        passed: reviewWorkflow !== undefined,
        evidence: `step codenames of added workflows: ${describeList(
          addedWorkflows.flatMap((workflow) => workflow.steps.map((step) => step.codename)),
        )}`,
      },
      {
        id: "blog-collection-exists",
        passed: blogCollection !== undefined,
        evidence: `collection codenames: ${describeList(
          allCollections.map((collection) => collection.codename),
        )}`,
      },
      {
        id: "default-workflow-intact",
        passed: allWorkflows.some((workflow) => workflow.codename === DEFAULT_CODENAME),
        evidence: `workflow codenames: ${describeList(allWorkflows.map((workflow) => workflow.codename))}`,
      },
      {
        id: "default-collection-intact",
        passed: allCollections.some((collection) => collection.codename === DEFAULT_CODENAME),
        evidence: `collection codenames: ${describeList(
          allCollections.map((collection) => collection.codename),
        )}`,
      },
    ]);
  },
};
