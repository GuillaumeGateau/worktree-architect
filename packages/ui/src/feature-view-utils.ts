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

export type AgentStageFigureState = "idle" | "walking" | "working" | "done";
export type AgentStageFigureRole = "agent" | "auditor";

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

type StepLike = {
  id: string;
  ordinal: number;
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
  const compact = message
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\s+[—-]\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!compact) return "Working";
  return compact.length > 48 ? `${compact.slice(0, 47)}…` : compact;
}

export function toHumanStatusLabel(kind: string, message: string): string {
  const launch = parseL2TaskLaunch(message);
  if (launch) return `Starting task ${launch.taskOrdinal}`;

  const taskStatus = parseL2TaskStatus(message);
  if (taskStatus?.terminal === "completed") return "Done ✓";
  if (taskStatus?.terminal === "failed") return "Failed";

  if (/All L2 tasks completed\. Launching merge auditor/i.test(message)) {
    return "Starting merge audit";
  }
  if (/Merge auditor launched/i.test(message)) return "Merge audit running";
  if (/Merge auditor completed/i.test(message)) return "Merge done ✓";
  if (/Merge auditor (FAILED|launch failed)/i.test(message)) return "Merge failed";

  if (kind === "note" && isFinishedNote(message)) return "Done ✓";
  if (kind === "agent") return "Walking to task";
  if (kind === "tool") return "Working";
  if (kind === "merge") return "Merge audit running";
  if (kind === "error") return "Error";

  return shortenLabel(message);
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
    statusLabel: "Waiting",
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
    statusLabel: "Waiting for merge",
    updatedAt: new Date(0).toISOString(),
  };
  figures.set(figureId, created);
  return created;
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

  const orderedFigures = Array.from(figures.values()).sort((a, b) => {
    // Keep task figures in ordinal order and keep merge auditor last.
    if (a.role !== b.role) return a.role === "agent" ? -1 : 1;
    const aOrd = a.stepOrdinal ?? a.taskOrdinal ?? Number.MAX_SAFE_INTEGER;
    const bOrd = b.stepOrdinal ?? b.taskOrdinal ?? Number.MAX_SAFE_INTEGER;
    if (aOrd !== bOrd) return aOrd - bOrd;
    return a.figureId.localeCompare(b.figureId);
  });

  return {
    figures: orderedFigures,
    agentIdToFigure,
  };
}
