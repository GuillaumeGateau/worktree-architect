/** Sort plan steps by ordinal for the feature stepper. */
export function sortStepsByOrdinal<T extends { ordinal: number }>(steps: T[]): T[] {
  return [...steps].sort((a, b) => a.ordinal - b.ordinal);
}

/** Activity feed: optional kind filter, newest-first. */
export function filterAndReverseActivity<T extends { kind: string }>(
  activity: T[],
  kindFilter: string
): T[] {
  const filtered =
    kindFilter === "all" ? [...activity] : activity.filter((a) => a.kind === kindFilter);
  return filtered.reverse();
}

export type SceneRoleState = "active" | "blocked" | "waiting";

export type SceneRoleStatusLine = {
  role: "orchestrator" | "reviewer" | "tester";
  label: string;
  state: SceneRoleState;
  detail: string;
};

export type AgentStageFigureState = "idle" | "walking" | "working" | "done";
export type AgentStageFigureRole = "agent" | "reviewer" | "tester" | "auditor";

export type AgentStageFigure = {
  figureId: string;
  role: AgentStageFigureRole;
  taskOrdinal?: number;
  stepId?: string;
  stepOrdinal?: number;
  agentId?: string;
  state: AgentStageFigureState;
  statusLabel: string;
  updatedAt: string;
};

export type AgentStageMotionZone = "desk" | "transition" | "task" | "merge";

type StepLike = {
  id: string;
  ordinal: number;
  status?: string;
  updatedAt?: string;
};

type ActivityLike = {
  id: string;
  kind: string;
  message: string;
  stepId?: string;
  createdAt: string;
};

export type AgentStageDerivedState = {
  figures: AgentStageFigure[];
  agentIdToFigure: Record<string, string>;
};

const SHARED_OFFICE_VISIBLE_ROLES: AgentStageFigureRole[] = [
  "agent",
  "reviewer",
  "tester",
  "auditor",
];

/** Role checks for shared-office visibility. */
export function isSharedOfficeVisibleRole(role: string): role is AgentStageFigureRole {
  return SHARED_OFFICE_VISIBLE_ROLES.includes(role as AgentStageFigureRole);
}

export type ReviewerTesterVisibility = {
  reviewerVisible: boolean;
  testerVisible: boolean;
};

/**
 * Validate reviewer and tester visibility from role membership.
 * Used by smoke checks to ensure both lanes are represented.
 */
export function validateReviewerTesterVisibility(
  roles: Iterable<string>
): ReviewerTesterVisibility {
  const seen = new Set<string>();
  for (const role of roles) seen.add(role);
  return {
    reviewerVisible: seen.has("reviewer"),
    testerVisible: seen.has("tester"),
  };
}

export type DeskState = "empty" | "arriving" | "active" | "complete";

export type DeskView = {
  deskId: string;
  figureId: string;
  role: AgentStageFigureRole;
  taskOrdinal?: number;
  stepId?: string;
  stepOrdinal?: number;
  agentId?: string;
  deskState: DeskState;
  statusLabel: string;
  updatedAt: string;
};

export type DeskDerivedState = {
  desks: DeskView[];
  agentIdToDesk: Record<string, string>;
};

export type OfficeLifecycleState =
  | "active"
  | "waiting"
  | "review"
  | "testing"
  | "done"
  | "failed"
  | "cancelled";

export type OfficePoint = {
  x: number;
  y: number;
};

export type OfficeZoneKind = "desk" | "hub" | "review" | "test";

export type OfficeZone = {
  id: string;
  label: string;
  kind: OfficeZoneKind;
  center: OfficePoint;
  size: { width: number; height: number };
};

export type OfficeDeskZone = OfficeZone & {
  kind: "desk";
  index: number;
  row: number;
  column: number;
};

export type OfficeTransitPath = {
  id: string;
  fromZoneId: string;
  toZoneId: string;
  points: OfficePoint[];
};

export type OfficeLayoutModel = {
  bounds: { width: number; height: number };
  deskRows: number;
  deskColumns: number;
  desks: OfficeDeskZone[];
  zones: {
    hub: OfficeZone;
    review: OfficeZone;
    test: OfficeZone;
  };
  transitPaths: OfficeTransitPath[];
};

export type OfficeFigurePlacement = {
  figureId: string;
  role: AgentStageFigureRole;
  lifecycleState: OfficeLifecycleState;
  deskZoneId: string;
  currentZoneId: string;
  transitPathIds: string[];
};

export type OfficeSceneState = {
  layout: OfficeLayoutModel;
  placements: OfficeFigurePlacement[];
};

export const OFFICE_HUB_ZONE_ID = "zone-hub";
export const OFFICE_REVIEW_ZONE_ID = "zone-review";
export const OFFICE_TEST_ZONE_ID = "zone-test";

function deskZoneId(index: number): string {
  return `desk-${index}`;
}

function pathId(fromZoneId: string, toZoneId: string): string {
  return `path-${fromZoneId}-to-${toZoneId}`;
}

export function normalizeOfficeLifecycleState(statusText: string | undefined): OfficeLifecycleState {
  const normalized = (statusText ?? "").trim().toLowerCase();
  if (!normalized) return "waiting";
  if (/cancel/.test(normalized)) return "cancelled";
  if (/\b(fail|failed|error)\b/.test(normalized)) return "failed";
  if (/\b(done|complete(d)?|finished)\b/.test(normalized)) return "done";
  if (/\b(review|reviewing|audit)\b/.test(normalized)) return "review";
  if (/\b(test|tests|testing|qa)\b/.test(normalized)) return "testing";
  if (/\b(active|running|working|walking|starting|in progress)\b/.test(normalized)) return "active";
  if (/\b(wait|waiting|idle|queued)\b/.test(normalized)) return "waiting";
  return "waiting";
}

export function lifecycleStateForFigure(
  figure: Pick<AgentStageFigure, "state" | "statusLabel">
): OfficeLifecycleState {
  const byLabel = normalizeOfficeLifecycleState(figure.statusLabel);
  if (byLabel !== "waiting") return byLabel;
  if (figure.state === "walking" || figure.state === "working") return "active";
  if (figure.state === "done") return "done";
  return "waiting";
}

/**
 * Build deterministic office geometry for shared-agent visualization.
 * Given the same desk count and columns, the output coordinates are stable.
 */
export function buildOfficeLayoutModel(
  deskCountInput: number,
  opts?: { deskColumns?: number }
): OfficeLayoutModel {
  const deskCount = Math.max(1, Math.floor(deskCountInput));
  const deskColumns = Math.max(
    1,
    Math.floor(opts?.deskColumns ?? Math.min(4, Math.max(1, deskCount)))
  );
  const deskRows = Math.ceil(deskCount / deskColumns);

  const padding = 24;
  const deskSize = { width: 78, height: 52 };
  const deskGap = { x: 18, y: 16 };
  const zoneSize = { width: 132, height: 74 };
  const zoneGapY = 54;
  const sideZoneGapX = 28;

  const deskGridWidth = deskColumns * deskSize.width + (deskColumns - 1) * deskGap.x;
  const deskGridHeight = deskRows * deskSize.height + (deskRows - 1) * deskGap.y;
  const zoneBandWidth = zoneSize.width * 3 + sideZoneGapX * 2;
  const layoutWidth = Math.max(deskGridWidth, zoneBandWidth);

  const deskStartX = padding + (layoutWidth - deskGridWidth) / 2;
  const deskStartY = padding;
  const hubCenterY = deskStartY + deskGridHeight + zoneGapY + zoneSize.height / 2;
  const hubCenterX = padding + layoutWidth / 2;

  const hub: OfficeZone = {
    id: OFFICE_HUB_ZONE_ID,
    label: "Orchestration Hub",
    kind: "hub",
    center: { x: hubCenterX, y: hubCenterY },
    size: zoneSize,
  };
  const review: OfficeZone = {
    id: OFFICE_REVIEW_ZONE_ID,
    label: "Review Zone",
    kind: "review",
    center: {
      x: hubCenterX - (zoneSize.width + sideZoneGapX),
      y: hubCenterY,
    },
    size: zoneSize,
  };
  const test: OfficeZone = {
    id: OFFICE_TEST_ZONE_ID,
    label: "Test Zone",
    kind: "test",
    center: {
      x: hubCenterX + (zoneSize.width + sideZoneGapX),
      y: hubCenterY,
    },
    size: zoneSize,
  };

  const desks: OfficeDeskZone[] = [];
  for (let index = 0; index < deskCount; index += 1) {
    const row = Math.floor(index / deskColumns);
    const column = index % deskColumns;
    desks.push({
      id: deskZoneId(index),
      label: `Desk ${index + 1}`,
      kind: "desk",
      index,
      row,
      column,
      center: {
        x: deskStartX + column * (deskSize.width + deskGap.x) + deskSize.width / 2,
        y: deskStartY + row * (deskSize.height + deskGap.y) + deskSize.height / 2,
      },
      size: deskSize,
    });
  }

  const transitPaths: OfficeTransitPath[] = [];
  for (const desk of desks) {
    transitPaths.push({
      id: pathId(desk.id, hub.id),
      fromZoneId: desk.id,
      toZoneId: hub.id,
      points: [
        desk.center,
        { x: desk.center.x, y: hub.center.y },
        hub.center,
      ],
    });
  }
  transitPaths.push({
    id: pathId(hub.id, review.id),
    fromZoneId: hub.id,
    toZoneId: review.id,
    points: [hub.center, review.center],
  });
  transitPaths.push({
    id: pathId(hub.id, test.id),
    fromZoneId: hub.id,
    toZoneId: test.id,
    points: [hub.center, test.center],
  });

  return {
    bounds: {
      width: padding * 2 + layoutWidth,
      height: hub.center.y + zoneSize.height / 2 + padding,
    },
    deskRows,
    deskColumns,
    desks,
    zones: { hub, review, test },
    transitPaths,
  };
}

function compareFiguresForDeskAssignment(a: AgentStageFigure, b: AgentStageFigure): number {
  const aOrdinal = a.taskOrdinal ?? Number.MAX_SAFE_INTEGER;
  const bOrdinal = b.taskOrdinal ?? Number.MAX_SAFE_INTEGER;
  if (aOrdinal !== bOrdinal) return aOrdinal - bOrdinal;
  return a.figureId.localeCompare(b.figureId);
}

function nextUnusedDeskIndex(used: Set<number>): number {
  let i = 0;
  while (used.has(i)) i += 1;
  return i;
}

function preferredDeskIndexForFigure(figure: AgentStageFigure): number | undefined {
  if (figure.taskOrdinal === undefined) return undefined;
  if (!Number.isInteger(figure.taskOrdinal)) return undefined;
  if (figure.taskOrdinal < 0) return undefined;
  return figure.taskOrdinal;
}

/**
 * Attach figures to deterministic desks and zones for office rendering.
 */
export function deriveOfficeSceneState(
  figures: AgentStageFigure[],
  opts?: { deskCount?: number; deskColumns?: number }
): OfficeSceneState {
  const maxOrdinal = figures.reduce((max, f) => {
    const ord = preferredDeskIndexForFigure(f);
    return ord === undefined ? max : Math.max(max, ord);
  }, -1);
  const requestedCount = Math.max(0, Math.floor(opts?.deskCount ?? figures.length));
  const deskCount = Math.max(1, requestedCount, maxOrdinal + 1);
  const layout = buildOfficeLayoutModel(deskCount, { deskColumns: opts?.deskColumns });
  const deskByIndex = new Map(layout.desks.map((d) => [d.index, d]));

  const sortedFigures = [...figures].sort(compareFiguresForDeskAssignment);
  const usedDeskIndexes = new Set<number>();

  const placements: OfficeFigurePlacement[] = sortedFigures.map((figure) => {
    const preferred = preferredDeskIndexForFigure(figure);
    let assignedDeskIndex = preferred;
    if (
      assignedDeskIndex === undefined ||
      assignedDeskIndex >= deskCount ||
      usedDeskIndexes.has(assignedDeskIndex)
    ) {
      assignedDeskIndex = nextUnusedDeskIndex(usedDeskIndexes);
    }
    usedDeskIndexes.add(assignedDeskIndex);

    const desk = deskByIndex.get(assignedDeskIndex) ?? layout.desks[0];
    const lifecycleState = lifecycleStateForFigure(figure);
    const currentZoneId =
      lifecycleState === "review"
        ? OFFICE_REVIEW_ZONE_ID
        : lifecycleState === "testing"
          ? OFFICE_TEST_ZONE_ID
          : lifecycleState === "active"
            ? OFFICE_HUB_ZONE_ID
            : desk.id;

    const transitPathIds: string[] = [];
    if (currentZoneId !== desk.id) {
      transitPathIds.push(pathId(desk.id, OFFICE_HUB_ZONE_ID));
    }
    if (currentZoneId === OFFICE_REVIEW_ZONE_ID) {
      transitPathIds.push(pathId(OFFICE_HUB_ZONE_ID, OFFICE_REVIEW_ZONE_ID));
    }
    if (currentZoneId === OFFICE_TEST_ZONE_ID) {
      transitPathIds.push(pathId(OFFICE_HUB_ZONE_ID, OFFICE_TEST_ZONE_ID));
    }

    return {
      figureId: figure.figureId,
      role: figure.role,
      lifecycleState,
      deskZoneId: desk.id,
      currentZoneId,
      transitPathIds,
    };
  });

  return { layout, placements };
}
type SceneStepLike = {
  id: string;
  ordinal: number;
  title: string;
  status: string;
};
const TASK_AGENT_LAUNCHED_RE =
  /L2 agent launched for task \[(\d+)\][\s\S]*?[—-]\s*(\S+)/i;
const TASK_STATUS_RE = /L2 task \[(\d+)\][\s\S]*?\b(completed|FAILED)\b/i;

function parseTaskOrdinal(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : undefined;
}

export function extractCursorAgentId(input: string): string | undefined {
  const text = input.trim();
  if (!text) return undefined;

  try {
    const asUrl = new URL(text);
    const parts = asUrl.pathname.split("/").filter(Boolean);
    for (let i = parts.length - 1; i >= 0; i -= 1) {
      if (/^[A-Za-z0-9_-]{6,}$/.test(parts[i])) {
        return parts[i];
      }
    }
  } catch {
    // Input is not a URL; fall through to regex extraction.
  }

  const m = text.match(/agent[s]?\/([A-Za-z0-9_-]{6,})/i);
  return m?.[1];
}

type ParsedLaunchInfo = { taskOrdinal: number; agentId?: string };

function parseL2TaskLaunch(message: string): ParsedLaunchInfo | undefined {
  const m = message.match(TASK_AGENT_LAUNCHED_RE);
  if (!m) return undefined;
  const taskOrdinal = parseTaskOrdinal(m[1]);
  if (taskOrdinal === undefined) return undefined;
  return { taskOrdinal, agentId: extractCursorAgentId(m[2] ?? "") };
}

type ParsedTaskStatusInfo = {
  taskOrdinal: number;
  terminal: "completed" | "failed";
};

function parseL2TaskStatus(message: string): ParsedTaskStatusInfo | undefined {
  const m = message.match(TASK_STATUS_RE);
  if (!m) return undefined;
  const taskOrdinal = parseTaskOrdinal(m[1]);
  if (taskOrdinal === undefined) return undefined;
  const status = m[2].toLowerCase() === "completed" ? "completed" : "failed";
  return { taskOrdinal, terminal: status };
}

function isFinishedNote(message: string): boolean {
  return /\b(finished|completed|done)\b/i.test(message) && !/Launching merge auditor/i.test(message);
}

function shortenLabel(message: string): string {
  const compact = message.replace(/\s+/g, " ").trim();
  if (!compact) return "Working";
  return compact.length > 40 ? `${compact.slice(0, 39)}…` : compact;
}

function latestMatchingActivity(
  activity: ActivityLike[],
  predicate: (ev: ActivityLike) => boolean
): ActivityLike | undefined {
  const filtered = activity.filter(predicate);
  if (filtered.length === 0) return undefined;
  return [...filtered].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )[0];
}

function isBlockedMessage(message: string): boolean {
  return /\b(blocked|failed|error|launch failed)\b/i.test(message);
}

function isCompletedMessage(message: string): boolean {
  return /\b(completed|done|finished|passed|success)\b/i.test(message);
}

export function deriveSceneRoleStatusLines(
  featureStatus: string | undefined,
  steps: SceneStepLike[],
  activity: ActivityLike[]
): SceneRoleStatusLine[] {
  const activeStep = steps.find((s) => s.status === "active");
  const blockedStep = steps.find((s) => s.status === "blocked");
  const terminalFeature = ["completed", "failed", "cancelled"].includes(featureStatus ?? "");

  const orchestrator: SceneRoleStatusLine = (() => {
    if (featureStatus === "executing") {
      if (blockedStep) {
        return {
          role: "orchestrator",
          label: "Orchestrator",
          state: "blocked",
          detail: `Blocked on step ${blockedStep.ordinal}: ${blockedStep.title}`,
        };
      }
      if (activeStep) {
        return {
          role: "orchestrator",
          label: "Orchestrator",
          state: "active",
          detail: `Executing step ${activeStep.ordinal}: ${activeStep.title}`,
        };
      }
      return {
        role: "orchestrator",
        label: "Orchestrator",
        state: "active",
        detail: "Coordinating execution",
      };
    }
    if (featureStatus === "failed") {
      return {
        role: "orchestrator",
        label: "Orchestrator",
        state: "blocked",
        detail: "Execution failed before handoff",
      };
    }
    if (featureStatus === "cancelled") {
      return {
        role: "orchestrator",
        label: "Orchestrator",
        state: "blocked",
        detail: "Execution cancelled",
      };
    }
    if (featureStatus === "completed") {
      return {
        role: "orchestrator",
        label: "Orchestrator",
        state: "waiting",
        detail: "Execution complete; waiting on reviewer/tester",
      };
    }
    return {
      role: "orchestrator",
      label: "Orchestrator",
      state: "waiting",
      detail: "Waiting for Start",
    };
  })();

  const reviewerEvent = latestMatchingActivity(
    activity,
    (ev) => {
      if (ev.kind === "merge") return true;
      if (!/merge auditor|review/i.test(ev.message)) return false;
      // Avoid classifying tester "reviewer handoff" messages as reviewer activity.
      return !/\b(test|tests|tester|qa|verify|verification)\b/i.test(ev.message);
    }
  );
  const reviewer: SceneRoleStatusLine = (() => {
    if (reviewerEvent) {
      if (isBlockedMessage(reviewerEvent.message)) {
        return {
          role: "reviewer",
          label: "Reviewer",
          state: "blocked",
          detail: shortenLabel(reviewerEvent.message),
        };
      }
      if (isCompletedMessage(reviewerEvent.message)) {
        return {
          role: "reviewer",
          label: "Reviewer",
          state: "waiting",
          detail: "Review complete",
        };
      }
      return {
        role: "reviewer",
        label: "Reviewer",
        state: "active",
        detail: toHumanStatusLabel(reviewerEvent.kind, reviewerEvent.message),
      };
    }
    if (terminalFeature) {
      return {
        role: "reviewer",
        label: "Reviewer",
        state: "waiting",
        detail: "Waiting to review the completed run",
      };
    }
    return {
      role: "reviewer",
      label: "Reviewer",
      state: "waiting",
      detail: "Waiting for orchestrator handoff",
    };
  })();

  const testerEvent = latestMatchingActivity(
    activity,
    (ev) => ev.kind === "tool" && /\b(test|tests|qa|verify|verification)\b/i.test(ev.message)
  );
  const tester: SceneRoleStatusLine = (() => {
    if (testerEvent) {
      if (isBlockedMessage(testerEvent.message)) {
        return {
          role: "tester",
          label: "Tester",
          state: "blocked",
          detail: shortenLabel(testerEvent.message),
        };
      }
      if (isCompletedMessage(testerEvent.message)) {
        return {
          role: "tester",
          label: "Tester",
          state: "waiting",
          detail: "Testing complete",
        };
      }
      return {
        role: "tester",
        label: "Tester",
        state: "active",
        detail: shortenLabel(testerEvent.message),
      };
    }
    if (terminalFeature) {
      return {
        role: "tester",
        label: "Tester",
        state: "waiting",
        detail: "Waiting for validation/testing work",
      };
    }
    return {
      role: "tester",
      label: "Tester",
      state: "waiting",
      detail: "Waiting for reviewer signal",
    };
  })();

  return [orchestrator, reviewer, tester];
}

export function toHumanStatusLabel(kind: string, message: string): string {
  const launch = parseL2TaskLaunch(message);
  if (launch) return `Task ${launch.taskOrdinal} starting`;

  const taskStatus = parseL2TaskStatus(message);
  if (taskStatus?.terminal === "completed") return "Done";
  if (taskStatus?.terminal === "failed") return "Failed";

  if (/All L2 tasks completed\. Launching merge auditor/i.test(message)) {
    return "Merge starting";
  }
  if (/Merge auditor launched/i.test(message)) return "Merge running";
  if (/Merge auditor completed/i.test(message)) return "Merge done";
  if (/Merge auditor (FAILED|launch failed)/i.test(message)) return "Merge failed";

  if (kind === "note" && isFinishedNote(message)) return "Done";
  if (kind === "agent") return "Walking";
  if (kind === "tool") return "Working";
  if (kind === "merge") return "Merge running";
  if (kind === "error") return "Error";

  return shortenLabel(message);
}

const MOTION_SETTLE_MS = 1400;

function parseTimestampMs(value: string | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Movement zone for rendering:
 * - walking: leave desk and move toward the assigned zone
 * - working: briefly pass through transition, then stay in task/merge zone
 * - done: briefly transition back, then return to desk
 * - idle: remain at desk
 */
export function motionZoneForFigure(
  figure: AgentStageFigure,
  nowMs: number = Date.now()
): AgentStageMotionZone {
  const updatedMs = parseTimestampMs(figure.updatedAt);
  const recentlyUpdated =
    updatedMs !== null && nowMs >= updatedMs && nowMs - updatedMs < MOTION_SETTLE_MS;

  if (figure.state === "walking") return "transition";

  if (figure.role === "auditor") {
    if (figure.state === "working") return recentlyUpdated ? "transition" : "merge";
    if (figure.state === "done") return recentlyUpdated ? "transition" : "desk";
    return "desk";
  }

  if (figure.state === "working") return recentlyUpdated ? "transition" : "task";
  if (figure.state === "done") return recentlyUpdated ? "transition" : "desk";
  return "desk";
}

function mergeStateForActivity(message: string): AgentStageFigureState {
  if (/Merge auditor completed/i.test(message)) return "done";
  if (/Merge auditor (FAILED|launch failed)/i.test(message)) return "done";
  return "working";
}

function taskStateForActivity(kind: string, message: string): AgentStageFigureState {
  if (parseL2TaskStatus(message)) return "done";
  if (kind === "note" && isFinishedNote(message)) return "done";
  if (kind === "agent") return "walking";
  if (kind === "tool") return "working";
  if (kind === "merge") return "working";
  return "idle";
}

function getTaskFigure(
  figures: Map<string, AgentStageFigure>,
  taskOrdinal: number,
  stepByOrdinal: Map<number, StepLike>
): AgentStageFigure {
  const figureId = `task-${taskOrdinal}`;
  const existing = figures.get(figureId);
  if (existing) return existing;
  const step = stepByOrdinal.get(taskOrdinal);
  const created: AgentStageFigure = {
    figureId,
    role: "agent",
    taskOrdinal,
    stepOrdinal: step?.ordinal ?? taskOrdinal,
    stepId: step?.id,
    state: "idle",
    statusLabel: "Idle",
    updatedAt: new Date(0).toISOString(),
  };
  figures.set(figureId, created);
  return created;
}

function getAuditorFigure(figures: Map<string, AgentStageFigure>): AgentStageFigure {
  const figureId = "merge-auditor";
  const existing = figures.get(figureId);
  if (existing) return existing;
  const created: AgentStageFigure = {
    figureId,
    role: "auditor",
    state: "idle",
    statusLabel: "Merge idle",
    updatedAt: new Date(0).toISOString(),
  };
  figures.set(figureId, created);
  return created;
}

const UNSET_AT = new Date(0).toISOString();

function stepStatusToFigureState(
  status?: string
): { state: AgentStageFigureState; label: string } | undefined {
  const s = status?.toLowerCase();
  if (!s) return undefined;
  if (s === "active" || s === "running") return { state: "working", label: "Working" };
  if (s === "claimed") return { state: "walking", label: "Walking to task" };
  if (s === "done" || s === "completed" || s === "succeeded") return { state: "done", label: "Done ✓" };
  if (s === "failed") return { state: "done", label: "Failed" };
  if (s === "blocked") return { state: "idle", label: "Blocked" };
  if (s === "pending" || s === "queued" || s === "ready" || s === "draft") {
    return { state: "idle", label: "Waiting" };
  }
  return undefined;
}

/**
 * Derive AgentStage-ready figure state from the polled activity feed.
 * This keeps the rendering component simple and deterministic.
 */
export function deriveAgentStageState(
  activity: ActivityLike[],
  steps: StepLike[]
): AgentStageDerivedState {
  const stepById = new Map(steps.map((s) => [s.id, s]));
  const stepByOrdinal = new Map(sortStepsByOrdinal(steps).map((s) => [s.ordinal, s]));
  const figures = new Map<string, AgentStageFigure>();
  const agentIdToFigure: Record<string, string> = {};

  const chronological = [...activity].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  for (const ev of chronological) {
    const launch = parseL2TaskLaunch(ev.message);
    const taskStatus = parseL2TaskStatus(ev.message);
    const stepOrdinal = ev.stepId ? stepById.get(ev.stepId)?.ordinal : undefined;

    const taskOrdinal = launch?.taskOrdinal ?? taskStatus?.taskOrdinal ?? stepOrdinal;
    if (taskOrdinal !== undefined) {
      const fig = getTaskFigure(figures, taskOrdinal, stepByOrdinal);
      if (launch?.agentId) {
        fig.agentId = launch.agentId;
        agentIdToFigure[launch.agentId] = fig.figureId;
      }
      fig.stepOrdinal = stepOrdinal ?? fig.stepOrdinal ?? taskOrdinal;
      fig.stepId = ev.stepId ?? fig.stepId ?? stepByOrdinal.get(taskOrdinal)?.id;
      fig.state = taskStateForActivity(ev.kind, ev.message);
      fig.statusLabel = toHumanStatusLabel(ev.kind, ev.message);
      fig.updatedAt = ev.createdAt;
      continue;
    }

    if (ev.kind === "merge" || /Merge auditor/i.test(ev.message)) {
      const auditor = getAuditorFigure(figures);
      auditor.state = mergeStateForActivity(ev.message);
      auditor.statusLabel = toHumanStatusLabel(ev.kind, ev.message);
      auditor.updatedAt = ev.createdAt;
    }
  }

  // Keep stage synchronized with live step status updates even when activity is sparse.
  for (const step of sortStepsByOrdinal(steps)) {
    const fig = getTaskFigure(figures, step.ordinal, stepByOrdinal);
    fig.stepId = step.id;
    fig.stepOrdinal = step.ordinal;
    const fromStep = stepStatusToFigureState(step.status);
    if (!fromStep) continue;
    const stepUpdatedMs = parseTimestampMs(step.updatedAt);
    const figureUpdatedMs = parseTimestampMs(fig.updatedAt);
    const canApplyStepStatus =
      fig.updatedAt === UNSET_AT ||
      stepUpdatedMs === null ||
      figureUpdatedMs === null ||
      stepUpdatedMs >= figureUpdatedMs;

    if (canApplyStepStatus) {
      fig.state = fromStep.state;
      fig.statusLabel = fromStep.label;
      if (stepUpdatedMs !== null) {
        fig.updatedAt = new Date(stepUpdatedMs).toISOString();
      }
    }
  }

  return {
    figures: Array.from(figures.values()),
    agentIdToFigure,
  };
}

/** Running cloud agents are launched task agents that are not terminal yet. */
export function countRunningCloudAgents(figures: AgentStageFigure[]): number {
  return figures.reduce((count, fig) => {
    if (fig.role !== "agent") return count;
    if (!fig.agentId) return count;
    if (fig.state === "done") return count;
    return count + 1;
  }, 0);
}

/**
 * Map figure state to desk occupancy state used by the shared office view.
 */
export function mapFigureStateToDeskState(state: AgentStageFigureState): DeskState {
  if (state === "walking") return "arriving";
  if (state === "working") return "active";
  if (state === "done") return "complete";
  return "empty";
}

/**
 * Build desk-level derived state from activity events and plan steps.
 */
export function deriveDeskState(activity: ActivityLike[], steps: StepLike[]): DeskDerivedState {
  const stage = deriveAgentStageState(activity, steps);
  const desks = stage.figures
    .map<DeskView>((figure) => ({
      deskId: `desk-${figure.figureId}`,
      figureId: figure.figureId,
      role: figure.role,
      taskOrdinal: figure.taskOrdinal,
      stepId: figure.stepId,
      stepOrdinal: figure.stepOrdinal,
      agentId: figure.agentId,
      deskState: mapFigureStateToDeskState(figure.state),
      statusLabel: figure.statusLabel,
      updatedAt: figure.updatedAt,
    }))
    .sort((a, b) => {
      if (a.role !== b.role) return a.role === "agent" ? -1 : 1;
      return (a.taskOrdinal ?? Number.MAX_SAFE_INTEGER) - (b.taskOrdinal ?? Number.MAX_SAFE_INTEGER);
    });

  const agentIdToDesk: Record<string, string> = {};
  for (const [agentId, figureId] of Object.entries(stage.agentIdToFigure)) {
    const deskId = `desk-${figureId}`;
    agentIdToDesk[agentId] = deskId;
  }

  return { desks, agentIdToDesk };
}
