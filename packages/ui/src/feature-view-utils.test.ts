import { describe, expect, it } from "vitest";
import {
  buildOfficeLayoutModel,
  chooseDefaultFeatureRunId,
  countRunningCloudAgents,
  deriveAgentStageState,
  deriveOfficeSceneState,
  deriveSceneRoleStatusLines,
  deriveDeskState,
  extractCursorAgentId,
  filterAndReverseActivity,
  isSharedOfficeVisibleRole,
  mapFigureStateToDeskState,
  motionZoneForFigure,
  normalizeOfficeLifecycleState,
  sortStepsByOrdinal,
  toHumanStatusLabel,
  validateReviewerTesterVisibility,
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

  it("chooses most recent executing run over finished ones", () => {
    expect(
      chooseDefaultFeatureRunId([
        {
          id: "f-finished-newest",
          status: "completed",
          createdAt: "2026-03-26T12:00:00.000Z",
          updatedAt: "2026-03-26T12:00:00.000Z",
        },
        {
          id: "f-executing",
          status: "executing",
          createdAt: "2026-03-26T11:00:00.000Z",
          updatedAt: "2026-03-26T11:30:00.000Z",
        },
      ])
    ).toBe("f-executing");
  });

  it("falls back to most recently finished run when none executing", () => {
    expect(
      chooseDefaultFeatureRunId([
        {
          id: "f-failed-older",
          status: "failed",
          createdAt: "2026-03-26T09:00:00.000Z",
          updatedAt: "2026-03-26T09:00:00.000Z",
        },
        {
          id: "f-cancelled-newer",
          status: "cancelled",
          createdAt: "2026-03-26T10:00:00.000Z",
          updatedAt: "2026-03-26T10:00:00.000Z",
        },
      ])
    ).toBe("f-cancelled-newer");
  });

  it("returns null when there is no executing or finished run", () => {
    expect(
      chooseDefaultFeatureRunId([
        {
          id: "f-ready",
          status: "ready",
          createdAt: "2026-03-26T09:00:00.000Z",
          updatedAt: "2026-03-26T09:00:00.000Z",
        },
        {
          id: "f-draft",
          status: "draft",
          createdAt: "2026-03-26T10:00:00.000Z",
          updatedAt: "2026-03-26T10:00:00.000Z",
        },
      ])
    ).toBeNull();
  });

  it("extracts cursor agent ids from launch urls", () => {
    expect(extractCursorAgentId("https://cursor.com/agents/agt_ABC123xyz")).toBe("agt_ABC123xyz");
    expect(extractCursorAgentId("https://cursor.com/team/demo/agent/agent_789XYZ?tab=activity")).toBe(
      "agent_789XYZ"
    );
  });

  it("accepts reviewer/tester as shared-office visible roles", () => {
    expect(isSharedOfficeVisibleRole("agent")).toBe(true);
    expect(isSharedOfficeVisibleRole("reviewer")).toBe(true);
    expect(isSharedOfficeVisibleRole("tester")).toBe(true);
    expect(isSharedOfficeVisibleRole("auditor")).toBe(true);
    expect(isSharedOfficeVisibleRole("observer")).toBe(false);
  });

  it("validates reviewer and tester visibility from role checks", () => {
    expect(validateReviewerTesterVisibility(["agent", "reviewer"])).toEqual({
      reviewerVisible: true,
      testerVisible: false,
    });
    expect(validateReviewerTesterVisibility(["tester", "auditor"])).toEqual({
      reviewerVisible: false,
      testerVisible: true,
    });
    expect(validateReviewerTesterVisibility(["agent", "reviewer", "tester"])).toEqual({
      reviewerVisible: true,
      testerVisible: true,
    });
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

  it("maps figure states to movement zones", () => {
    const nowMs = Date.parse("2026-03-25T00:00:01.000Z");
    expect(
      motionZoneForFigure({
        figureId: "task-1",
        role: "agent",
        state: "walking",
        statusLabel: "Walking to task",
        updatedAt: "2026-03-25T00:00:00.000Z",
      }, nowMs)
    ).toBe("transition");

    expect(
      motionZoneForFigure({
        figureId: "task-1",
        role: "agent",
        state: "working",
        statusLabel: "Working",
        updatedAt: "2026-03-25T00:00:00.000Z",
      }, nowMs)
    ).toBe("transition");

    expect(
      motionZoneForFigure({
        figureId: "task-1",
        role: "agent",
        state: "working",
        statusLabel: "Working",
        updatedAt: "2026-03-25T00:00:00.000Z",
      }, nowMs + 2500)
    ).toBe("task");

    expect(
      motionZoneForFigure({
        figureId: "merge-auditor",
        role: "auditor",
        state: "working",
        statusLabel: "Merge audit running",
        updatedAt: "2026-03-25T00:00:00.000Z",
      }, nowMs)
    ).toBe("transition");

    expect(
      motionZoneForFigure({
        figureId: "merge-auditor",
        role: "auditor",
        state: "working",
        statusLabel: "Merge audit running",
        updatedAt: "2026-03-25T00:00:00.000Z",
      }, nowMs + 2500)
    ).toBe("merge");

    expect(
      motionZoneForFigure({
        figureId: "merge-auditor",
        role: "auditor",
        state: "done",
        statusLabel: "Merge done ✓",
        updatedAt: "2026-03-25T00:00:00.000Z",
      }, nowMs)
    ).toBe("transition");

    expect(
      motionZoneForFigure({
        figureId: "merge-auditor",
        role: "auditor",
        state: "done",
        statusLabel: "Merge done ✓",
        updatedAt: "2026-03-25T00:00:00.000Z",
      }, nowMs + 2500)
    ).toBe("desk");
  });

  it("syncs figure state from live step status without activity", () => {
    const derived = deriveAgentStageState(
      [],
      [
        { id: "step-0", ordinal: 0, status: "active" },
        { id: "step-1", ordinal: 1, status: "done" },
      ]
    );

    expect(derived.figures.find((f) => f.figureId === "task-0")).toMatchObject({
      figureId: "task-0",
      state: "working",
      statusLabel: "Working",
      stepId: "step-0",
      stepOrdinal: 0,
    });
    expect(derived.figures.find((f) => f.figureId === "task-1")).toMatchObject({
      figureId: "task-1",
      state: "done",
      statusLabel: "Done ✓",
      stepId: "step-1",
      stepOrdinal: 1,
    });
  });

  it("prefers newer step updates over stale activity state", () => {
    const derived = deriveAgentStageState(
      [
        {
          id: "a1",
          kind: "tool",
          message: "Running tests…",
          stepId: "step-0",
          createdAt: "2026-03-25T11:00:00.000Z",
        },
      ],
      [
        {
          id: "step-0",
          ordinal: 0,
          status: "done",
          updatedAt: "2026-03-25T11:00:05.000Z",
        },
      ]
    );

    expect(derived.figures.find((f) => f.figureId === "task-0")).toMatchObject({
      figureId: "task-0",
      state: "done",
      statusLabel: "Done ✓",
      stepId: "step-0",
      stepOrdinal: 0,
      updatedAt: "2026-03-25T11:00:05.000Z",
    });
  });

  it("builds deterministic office layout with desk grid and zones", () => {
    const layout = buildOfficeLayoutModel(5, { deskColumns: 3 });
    expect(layout.deskRows).toBe(2);
    expect(layout.deskColumns).toBe(3);
    expect(layout.desks.map((d) => d.id)).toEqual([
      "desk-0",
      "desk-1",
      "desk-2",
      "desk-3",
      "desk-4",
    ]);
    expect(layout.zones.hub.id).toBe("zone-hub");
    expect(layout.zones.review.id).toBe("zone-review");
    expect(layout.zones.test.id).toBe("zone-test");
    expect(layout.transitPaths.map((p) => p.id)).toEqual([
      "path-desk-0-to-zone-hub",
      "path-desk-1-to-zone-hub",
      "path-desk-2-to-zone-hub",
      "path-desk-3-to-zone-hub",
      "path-desk-4-to-zone-hub",
      "path-zone-hub-to-zone-review",
      "path-zone-hub-to-zone-test",
    ]);
  });

  it("normalizes lifecycle states for office scene status model", () => {
    expect(normalizeOfficeLifecycleState("Running tests now")).toBe("testing");
    expect(normalizeOfficeLifecycleState("Merge audit in review")).toBe("review");
    expect(normalizeOfficeLifecycleState("Done ✓")).toBe("done");
    expect(normalizeOfficeLifecycleState("Failed with error")).toBe("failed");
    expect(normalizeOfficeLifecycleState("Cancelled by user")).toBe("cancelled");
    expect(normalizeOfficeLifecycleState("queued")).toBe("waiting");
    expect(normalizeOfficeLifecycleState("working")).toBe("active");
  });

  it("maps figures into desks, execution zones, and transit paths", () => {
    const scene = deriveOfficeSceneState(
      [
        {
          figureId: "task-0",
          role: "agent",
          taskOrdinal: 0,
          state: "working",
          statusLabel: "Working",
          updatedAt: "2026-03-25T10:00:00.000Z",
        },
        {
          figureId: "task-1",
          role: "agent",
          taskOrdinal: 1,
          state: "working",
          statusLabel: "Reviewing PR",
          updatedAt: "2026-03-25T10:00:00.000Z",
        },
        {
          figureId: "task-2",
          role: "agent",
          taskOrdinal: 2,
          state: "working",
          statusLabel: "Testing integration",
          updatedAt: "2026-03-25T10:00:00.000Z",
        },
        {
          figureId: "task-3",
          role: "agent",
          taskOrdinal: 3,
          state: "done",
          statusLabel: "Done ✓",
          updatedAt: "2026-03-25T10:00:00.000Z",
        },
        {
          figureId: "task-4",
          role: "agent",
          taskOrdinal: 4,
          state: "done",
          statusLabel: "Failed",
          updatedAt: "2026-03-25T10:00:00.000Z",
        },
        {
          figureId: "task-5",
          role: "agent",
          taskOrdinal: 5,
          state: "idle",
          statusLabel: "Cancelled by user",
          updatedAt: "2026-03-25T10:00:00.000Z",
        },
        {
          figureId: "merge-auditor",
          role: "auditor",
          state: "idle",
          statusLabel: "Waiting for merge",
          updatedAt: "2026-03-25T10:00:00.000Z",
        },
      ],
      { deskColumns: 3 }
    );

    const byId = Object.fromEntries(scene.placements.map((p) => [p.figureId, p]));
    expect(byId["task-0"]).toMatchObject({
      deskZoneId: "desk-0",
      currentZoneId: "zone-hub",
      lifecycleState: "active",
      transitPathIds: ["path-desk-0-to-zone-hub"],
    });
    expect(byId["task-1"]).toMatchObject({
      deskZoneId: "desk-1",
      currentZoneId: "zone-review",
      lifecycleState: "review",
      transitPathIds: ["path-desk-1-to-zone-hub", "path-zone-hub-to-zone-review"],
    });
    expect(byId["task-2"]).toMatchObject({
      deskZoneId: "desk-2",
      currentZoneId: "zone-test",
      lifecycleState: "testing",
      transitPathIds: ["path-desk-2-to-zone-hub", "path-zone-hub-to-zone-test"],
    });
    expect(byId["task-3"]).toMatchObject({
      deskZoneId: "desk-3",
      currentZoneId: "desk-3",
      lifecycleState: "done",
      transitPathIds: [],
    });
    expect(byId["task-4"]).toMatchObject({
      deskZoneId: "desk-4",
      currentZoneId: "desk-4",
      lifecycleState: "failed",
      transitPathIds: [],
    });
    expect(byId["task-5"]).toMatchObject({
      deskZoneId: "desk-5",
      currentZoneId: "desk-5",
      lifecycleState: "cancelled",
      transitPathIds: [],
    });
    expect(byId["merge-auditor"]).toMatchObject({
      currentZoneId: "desk-6",
      lifecycleState: "waiting",
    });
  });

  it("derives orchestrator blocked and reviewer active statuses", () => {
    const lines = deriveSceneRoleStatusLines(
      "executing",
      [{ id: "s1", ordinal: 1, title: "Wire statuses", status: "blocked" }],
      [
        {
          id: "a1",
          kind: "merge",
          message: "Merge auditor launched — https://cursor.com/agents/agt_auditor",
          createdAt: "2026-03-25T12:00:00.000Z",
        },
      ]
    );

    expect(lines).toEqual([
      {
        role: "orchestrator",
        label: "Orchestrator",
        state: "blocked",
        detail: "Blocked on step 1: Wire statuses",
      },
      {
        role: "reviewer",
        label: "Reviewer",
        state: "active",
        detail: "Merge audit running",
      },
      {
        role: "tester",
        label: "Tester",
        state: "waiting",
        detail: "Waiting for reviewer signal",
      },
    ]);
  });

  it("derives tester active status from testing activity", () => {
    const lines = deriveSceneRoleStatusLines(
      "completed",
      [{ id: "s1", ordinal: 1, title: "Ship", status: "done" }],
      [
        {
          id: "a1",
          kind: "tool",
          message: "Running tests for reviewer handoff",
          createdAt: "2026-03-25T12:01:00.000Z",
        },
      ]
    );

    expect(lines).toEqual([
      {
        role: "orchestrator",
        label: "Orchestrator",
        state: "waiting",
        detail: "Execution complete; waiting on reviewer/tester",
      },
      {
        role: "reviewer",
        label: "Reviewer",
        state: "waiting",
        detail: "Waiting to review the completed run",
      },
      {
        role: "tester",
        label: "Tester",
        state: "active",
        detail: "Running tests for reviewer handoff",
      },
    ]);
  });

  it("counts running cloud agents from derived figures", () => {
    const derived = deriveAgentStageState(
      [
        {
          id: "a1",
          kind: "agent",
          message:
            'L2 agent launched for task [0] "Task zero" — https://cursor.com/agents/agt_task_0 (branch: orch-task)',
          createdAt: "2026-03-25T11:00:00.000Z",
        },
        {
          id: "a2",
          kind: "tool",
          message: "Working task zero",
          stepId: "step-0",
          createdAt: "2026-03-25T11:00:02.000Z",
        },
        {
          id: "a3",
          kind: "agent",
          message:
            'L2 agent launched for task [1] "Task one" — https://cursor.com/agents/agt_task_1 (branch: orch-task)',
          createdAt: "2026-03-25T11:01:00.000Z",
        },
        {
          id: "a4",
          kind: "tool",
          message: 'L2 task [1] "Task one" completed.',
          stepId: "step-1",
          createdAt: "2026-03-25T11:02:00.000Z",
        },
      ],
      [
        { id: "step-0", ordinal: 0 },
        { id: "step-1", ordinal: 1 },
      ]
    );
    expect(countRunningCloudAgents(derived.figures)).toBe(1);
  });

  it("maps figure states to desk states", () => {
    expect(mapFigureStateToDeskState("idle")).toBe("empty");
    expect(mapFigureStateToDeskState("walking")).toBe("arriving");
    expect(mapFigureStateToDeskState("working")).toBe("active");
    expect(mapFigureStateToDeskState("done")).toBe("complete");
  });

  it("derives desk state and agent-to-desk mapping", () => {
    const derived = deriveDeskState(
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
          kind: "tool",
          message: "Running tests…",
          stepId: "step-1",
          createdAt: "2026-03-25T11:01:00.000Z",
        },
      ],
      [{ id: "step-1", ordinal: 1 }]
    );

    expect(derived.desks).toEqual([
      expect.objectContaining({
        deskId: "desk-task-1",
        figureId: "task-1",
        deskState: "active",
        agentId: "agt_task1",
      }),
    ]);
    expect(derived.agentIdToDesk).toEqual({ agt_task1: "desk-task-1" });
  });
});
