import { describe, expect, it } from "vitest";
import {
  deriveAgentStageState,
  extractCursorAgentId,
  filterAndReverseActivity,
  sortStepsByOrdinal,
  toHumanStatusLabel,
} from "./feature-view-utils";

describe("feature-view-utils", () => {
  it("sorts steps by ordinal", () => {
    expect(
      sortStepsByOrdinal([
        { ordinal: 2, id: "b" },
        { ordinal: 0, id: "a" },
        { ordinal: 1, id: "m" },
      ]).map((s) => s.id)
    ).toEqual(["a", "m", "b"]);
  });

  it("filters activity by kind and reverses", () => {
    const rows = [
      { kind: "agent", id: "1", t: 1 },
      { kind: "note", id: "2", t: 2 },
      { kind: "agent", id: "3", t: 3 },
    ];
    expect(filterAndReverseActivity(rows, "all").map((r) => r.id)).toEqual(["3", "2", "1"]);
    expect(filterAndReverseActivity(rows, "agent").map((r) => r.id)).toEqual(["3", "1"]);
  });

  it("extracts cursor agent ids from launch urls", () => {
    expect(extractCursorAgentId("https://cursor.com/agents/agt_ABC123xyz")).toBe("agt_ABC123xyz");
    expect(extractCursorAgentId("https://cursor.com/team/demo/agent/agent_789XYZ?tab=activity")).toBe(
      "agent_789XYZ"
    );
  });

  it("humanizes common activity labels", () => {
    expect(
      toHumanStatusLabel(
        "agent",
        'L2 agent launched for task [0] "Derive figure state" — https://cursor.com/agents/agt_123456 (branch: orch-task)'
      )
    ).toBe("Starting task 0");
    expect(toHumanStatusLabel("tool", 'L2 task [1] "Wire stage" completed.')).toBe("Done ✓");
    expect(toHumanStatusLabel("plan", "All L2 tasks completed. Launching merge auditor…")).toBe(
      "Starting merge audit"
    );
  });

  it("compacts long fallback status text for stage labels", () => {
    expect(
      toHumanStatusLabel(
        "plan",
        "Investigating stage placement details — https://cursor.com/agents/agt_1234567890abcdefghijkl"
      )
    ).toBe("Investigating stage placement details");
  });

  it("derives task and merge figures from activity feed", () => {
    const steps = [
      { id: "step-0", ordinal: 0 },
      { id: "step-1", ordinal: 1 },
    ];
    const activity = [
      {
        id: "a3",
        kind: "tool",
        message: 'L2 task [0] "Derive figure state" completed.',
        stepId: "step-0",
        createdAt: "2026-03-25T10:02:00.000Z",
      },
      {
        id: "a1",
        kind: "agent",
        message:
          'L2 agent launched for task [0] "Derive figure state" — https://cursor.com/agents/agt_123456 (branch: orch-task)',
        createdAt: "2026-03-25T10:00:00.000Z",
      },
      {
        id: "a2",
        kind: "tool",
        message: "Running tests…",
        stepId: "step-0",
        createdAt: "2026-03-25T10:01:00.000Z",
      },
      {
        id: "a4",
        kind: "merge",
        message: "Merge auditor launched — https://cursor.com/agents/agt_auditor",
        createdAt: "2026-03-25T10:03:00.000Z",
      },
    ];

    const derived = deriveAgentStageState(activity, steps);
    const taskFigure = derived.figures.find((f) => f.figureId === "task-0");
    const auditor = derived.figures.find((f) => f.figureId === "merge-auditor");

    expect(taskFigure).toMatchObject({
      figureId: "task-0",
      role: "agent",
      state: "done",
      statusLabel: "Done ✓",
      taskOrdinal: 0,
      stepId: "step-0",
      stepOrdinal: 0,
      agentId: "agt_123456",
    });
    expect(derived.agentIdToFigure).toEqual({ agt_123456: "task-0" });
    expect(auditor).toMatchObject({
      figureId: "merge-auditor",
      role: "auditor",
      state: "working",
      statusLabel: "Merge audit running",
    });
  });

  it("marks note finished events as done for task figures", () => {
    const derived = deriveAgentStageState(
      [
        {
          id: "a1",
          kind: "agent",
          message:
            'L2 agent launched for task [1] "Wire stage" — https://cursor.com/agents/agt_task1 (branch: orch-task)',
          createdAt: "2026-03-25T11:00:00.000Z",
        },
        {
          id: "a2",
          kind: "note",
          message: "Task finished successfully.",
          stepId: "step-1",
          createdAt: "2026-03-25T11:01:00.000Z",
        },
      ],
      [{ id: "step-1", ordinal: 1 }]
    );
    expect(derived.figures.find((f) => f.figureId === "task-1")).toMatchObject({
      figureId: "task-1",
      state: "done",
      statusLabel: "Done ✓",
    });
  });

  it("returns task figures in ordinal order with auditor last", () => {
    const derived = deriveAgentStageState(
      [
        {
          id: "a1",
          kind: "agent",
          message:
            'L2 agent launched for task [2] "Later task" — https://cursor.com/agents/agt_task2 (branch: orch-task)',
          createdAt: "2026-03-25T12:00:00.000Z",
        },
        {
          id: "a2",
          kind: "agent",
          message:
            'L2 agent launched for task [0] "Earlier task" — https://cursor.com/agents/agt_task0 (branch: orch-task)',
          createdAt: "2026-03-25T12:01:00.000Z",
        },
        {
          id: "a3",
          kind: "merge",
          message: "Merge auditor launched — https://cursor.com/agents/agt_auditor",
          createdAt: "2026-03-25T12:02:00.000Z",
        },
      ],
      [
        { id: "step-0", ordinal: 0 },
        { id: "step-2", ordinal: 2 },
      ]
    );
    expect(derived.figures.map((f) => f.figureId)).toEqual(["task-0", "task-2", "merge-auditor"]);
  });
});
