import { describe, expect, it } from "vitest";
import {
  buildTaskCompletionTruth,
  evaluateFeatureDoneGate,
  isTaskTerminalStatus,
} from "./completion-truth.js";

describe("completion truth contract", () => {
  it("recognizes terminal task statuses", () => {
    expect(isTaskTerminalStatus("done")).toBe(true);
    expect(isTaskTerminalStatus("failed")).toBe(true);
    expect(isTaskTerminalStatus("blocked")).toBe(true);
    expect(isTaskTerminalStatus("active")).toBe(false);
  });

  it("passes feature done gate only when all done tasks are integrated and auditor finished", () => {
    const taskTruthById = {
      t1: buildTaskCompletionTruth({
        taskId: "t1",
        taskStatus: "done",
        integrationResult: "integrated",
        integratedBranch: "orch-feature-int-abc123",
      }),
      t2: buildTaskCompletionTruth({
        taskId: "t2",
        taskStatus: "done",
        integrationResult: "integrated",
        integratedBranch: "orch-feature-int-abc123",
      }),
    };

    const gate = evaluateFeatureDoneGate({
      tasks: [
        { id: "t1", status: "done" },
        { id: "t2", status: "done" },
      ],
      taskTruthById,
      requireMergeAuditorSuccess: true,
      mergeAuditorStatus: "FINISHED",
    });

    expect(gate.done).toBe(true);
    expect(gate.failureReasons).toEqual([]);
  });

  it("fails feature done gate for non-integrated task completions", () => {
    const taskTruthById = {
      t1: buildTaskCompletionTruth({
        taskId: "t1",
        taskStatus: "done",
        integrationResult: "not_integrated",
        nonIntegratedReason: "merge_failed",
      }),
    };

    const gate = evaluateFeatureDoneGate({
      tasks: [{ id: "t1", status: "done" }],
      taskTruthById,
      requireMergeAuditorSuccess: false,
    });

    expect(gate.done).toBe(false);
    expect(gate.failureReasons).toContain("task_completed_without_integration");
    expect(gate.nonIntegratedDoneTaskIds).toEqual(["t1"]);
  });
});
