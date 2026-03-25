import type { ReactNode } from "react";
import type { ActivityEventRow, FeatureRow, FeatureStepRow } from "./types";

type AgentRole = "l2" | "merge-auditor" | "feature";

export type AgentStageTask = {
  id: string;
  title: string;
  status: string;
  ordinal?: number;
  stepId?: string;
  agentId?: string;
};

export type AgentStageFeature = {
  feature: FeatureRow;
  steps: FeatureStepRow[];
  tasks?: AgentStageTask[];
  activity?: ActivityEventRow[];
};

export type AgentFigureRenderInfo = {
  role: AgentRole;
  terminal: boolean;
  statusText: string;
  label: string;
};

export type AgentStageProps = {
  feature: AgentStageFeature;
  className?: string;
  renderAgentFigure?: (info: AgentFigureRenderInfo) => ReactNode;
};

type DerivedFigure = {
  id: string;
  role: AgentRole;
  label: string;
  statusText: string;
  targetSlot: number;
  terminal: boolean;
};

const ACTIVE_TASK_STATUSES = new Set([
  "active",
  "running",
  "claimed",
  "in_progress",
  "in-progress",
]);
const TERMINAL_TASK_STATUSES = new Set([
  "done",
  "succeeded",
  "completed",
  "failed",
  "blocked",
  "cancelled",
  "canceled",
  "error",
  "expired",
]);
const TERMINAL_CLOUD_STATUSES = new Set(["finished", "error", "expired"]);

type ActivityLookup = {
  byTaskId: Map<string, ActivityEventRow>;
  byAgentId: Map<string, ActivityEventRow>;
  byOrdinal: Map<number, ActivityEventRow>;
};

function roleColor(role: AgentRole): string {
  if (role === "l2") return "#3b82f6";
  if (role === "merge-auditor") return "#d4a017";
  return "#7c3aed";
}

function asObject(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

function readString(
  obj: Record<string, unknown> | undefined,
  ...keys: string[]
): string | undefined {
  if (!obj) return undefined;
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return undefined;
}

function normalizeStatus(status: string | undefined): string {
  return (status ?? "unknown").trim().toLowerCase();
}

function isActiveStatus(status: string | undefined): boolean {
  return ACTIVE_TASK_STATUSES.has(normalizeStatus(status));
}

function isTerminalStatus(status: string | undefined): boolean {
  return TERMINAL_TASK_STATUSES.has(normalizeStatus(status));
}

function isTerminalCloudStatus(status: string | undefined): boolean {
  return TERMINAL_CLOUD_STATUSES.has(normalizeStatus(status));
}

function capitalize(s: string): string {
  if (!s) return "Unknown";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function stepIndexById(steps: FeatureStepRow[]): Map<string, number> {
  const out = new Map<string, number>();
  steps.forEach((step, idx) => out.set(step.id, idx));
  return out;
}

function getTaskStepIndex(
  task: AgentStageTask,
  steps: FeatureStepRow[],
  idxByStepId: Map<string, number>
): number | undefined {
  if (task.stepId && idxByStepId.has(task.stepId)) {
    return idxByStepId.get(task.stepId);
  }
  if (typeof task.ordinal === "number") {
    const idx = steps.findIndex((step) => step.ordinal === task.ordinal);
    if (idx >= 0) return idx;
  }
  const fromId = steps.findIndex((step) => step.id === task.id);
  if (fromId >= 0) return fromId;
  return undefined;
}

function getActiveStepIndex(steps: FeatureStepRow[]): number | undefined {
  const idx = steps.findIndex((step) => step.status === "active");
  return idx >= 0 ? idx : undefined;
}

function toHumanStatus(status: string): string {
  return status
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function buildActivityLookup(activity: ActivityEventRow[]): ActivityLookup {
  const ordered = [...activity].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  const byTaskId = new Map<string, ActivityEventRow>();
  const byAgentId = new Map<string, ActivityEventRow>();
  const byOrdinal = new Map<number, ActivityEventRow>();

  for (const row of ordered) {
    const details = asObject(row.details);
    const taskId = readString(details, "taskId");
    const agentId = readString(details, "agentId");
    const taskOrdinalRaw = readString(details, "taskOrdinal", "ordinal");
    const fromMessage = row.message.match(/L2 task \[(\d+)\]/i);
    const parsedOrdinal =
      Number(taskOrdinalRaw) >= 0
        ? Number(taskOrdinalRaw)
        : fromMessage
          ? Number(fromMessage[1])
          : Number.NaN;

    if (taskId && !byTaskId.has(taskId)) byTaskId.set(taskId, row);
    if (agentId && !byAgentId.has(agentId)) byAgentId.set(agentId, row);
    if (Number.isFinite(parsedOrdinal) && !byOrdinal.has(parsedOrdinal)) {
      byOrdinal.set(parsedOrdinal, row);
    }
  }

  return { byTaskId, byAgentId, byOrdinal };
}

function taskStatusFromActivity(task: AgentStageTask, lookup: ActivityLookup): string | undefined {
  const row =
    lookup.byTaskId.get(task.id) ??
    (task.agentId ? lookup.byAgentId.get(task.agentId) : undefined) ??
    (typeof task.ordinal === "number" ? lookup.byOrdinal.get(task.ordinal) : undefined);
  if (!row) return undefined;
  const details = asObject(row.details);
  return readString(details, "status", "taskStatus");
}

function taskStepIndexFromActivity(
  task: AgentStageTask,
  steps: FeatureStepRow[],
  idxByStepId: Map<string, number>,
  lookup: ActivityLookup
): number | undefined {
  const row =
    lookup.byTaskId.get(task.id) ??
    (task.agentId ? lookup.byAgentId.get(task.agentId) : undefined) ??
    (typeof task.ordinal === "number" ? lookup.byOrdinal.get(task.ordinal) : undefined);
  if (!row) return undefined;
  if (row.stepId && idxByStepId.has(row.stepId)) {
    return idxByStepId.get(row.stepId);
  }
  const details = asObject(row.details);
  const detailStepId = readString(details, "stepId");
  if (detailStepId && idxByStepId.has(detailStepId)) {
    return idxByStepId.get(detailStepId);
  }
  const detailOrdinal = readString(details, "taskOrdinal", "ordinal");
  if (detailOrdinal) {
    const parsed = Number(detailOrdinal);
    if (Number.isFinite(parsed)) {
      const idx = steps.findIndex((step) => step.ordinal === parsed);
      if (idx >= 0) return idx;
    }
  }
  return undefined;
}

function deriveL2Figures(
  tasks: AgentStageTask[],
  steps: FeatureStepRow[],
  activity: ActivityEventRow[],
  doneSlot: number
): DerivedFigure[] {
  const idxByStepId = stepIndexById(steps);
  const activityLookup = buildActivityLookup(activity);
  const out: DerivedFigure[] = [];

  for (const task of tasks) {
    const status = task.status || taskStatusFromActivity(task, activityLookup) || "active";
    const normalized = normalizeStatus(status);
    const active = isActiveStatus(normalized);
    const terminal = isTerminalStatus(normalized);
    if (!active && !terminal) continue;

    const fallbackStep = getActiveStepIndex(steps) ?? Math.max(steps.length - 1, 0);
    const taskStep =
      getTaskStepIndex(task, steps, idxByStepId) ??
      taskStepIndexFromActivity(task, steps, idxByStepId, activityLookup) ??
      fallbackStep;
    const targetSlot = terminal ? doneSlot : taskStep;

    out.push({
      id: task.agentId ? `l2:${task.agentId}` : `l2-task:${task.id}`,
      role: "l2",
      label: task.title,
      statusText: toHumanStatus(status),
      targetSlot,
      terminal,
    });
  }

  return out;
}

function deriveFeatureAgentFigure(
  feature: FeatureRow,
  steps: FeatureStepRow[],
  doneSlot: number
): DerivedFigure | null {
  const links = asObject(feature.links);
  const agentId = readString(links, "cursorAgentId");
  if (!agentId) return null;

  const agentStatusRaw = readString(links, "cursorAgentStatus");
  const statusText = toHumanStatus(agentStatusRaw ?? "active");
  const activeStep = getActiveStepIndex(steps) ?? 0;
  const terminal =
    isTerminalCloudStatus(agentStatusRaw) ||
    ["completed", "failed", "cancelled"].includes(normalizeStatus(feature.status));

  return {
    id: `feature:${agentId}`,
    role: "feature",
    label: "Feature agent",
    statusText,
    targetSlot: terminal ? doneSlot : activeStep,
    terminal,
  };
}

function deriveMergeAuditorFigure(
  feature: FeatureRow,
  steps: FeatureStepRow[],
  doneSlot: number
): DerivedFigure | null {
  const links = asObject(feature.links);
  const auditorAgentId = readString(links, "mergeAuditorAgentId");
  if (!auditorAgentId) return null;

  const mergeStatus = readString(links, "mergeAuditorStatus");
  const featureStatus = normalizeStatus(feature.status);
  const terminal =
    isTerminalCloudStatus(mergeStatus) || featureStatus === "completed" || featureStatus === "failed";
  const workStep = steps.length > 0 ? steps.length - 1 : 0;

  return {
    id: `auditor:${auditorAgentId}`,
    role: "merge-auditor",
    label: "Merge auditor",
    statusText: toHumanStatus(mergeStatus ?? (terminal ? "completed" : "running")),
    targetSlot: terminal ? doneSlot : workStep,
    terminal,
  };
}

function DefaultAgentFigure(props: { role: AgentRole; terminal: boolean; statusText: string }) {
  const color = roleColor(props.role);
  return (
    <div
      aria-hidden
      style={{
        width: 14,
        height: 14,
        borderRadius: "50%",
        border: "2px solid #fff",
        background: color,
        boxShadow: props.terminal ? "none" : `0 0 0 3px ${color}26`,
        flexShrink: 0,
      }}
    />
  );
}

export function AgentStage({ feature, className, renderAgentFigure }: AgentStageProps) {
  const steps = [...feature.steps].sort((a, b) => a.ordinal - b.ordinal);
  const doneSlot = steps.length;
  const slotCount = Math.max(steps.length + 1, 2);

  const featureAgentFigure = deriveFeatureAgentFigure(feature.feature, steps, doneSlot);
  const mergeAuditorFigure = deriveMergeAuditorFigure(feature.feature, steps, doneSlot);
  const figures: DerivedFigure[] = [
    ...deriveL2Figures(feature.tasks ?? [], steps, feature.activity ?? [], doneSlot),
    ...(featureAgentFigure ? [featureAgentFigure] : []),
    ...(mergeAuditorFigure ? [mergeAuditorFigure] : []),
  ];

  const layerHeight = Math.max(1, figures.length) * 34 + 20;
  const stageClass = ["agent-stage", className].filter(Boolean).join(" ");

  return (
    <section
      className={stageClass}
      aria-label="Agent execution stage"
      style={{
        border: "1px solid var(--border, #d9dee7)",
        borderRadius: 14,
        padding: "1rem 1rem 0.85rem",
        background: "var(--surface, #ffffff)",
      }}
    >
      <div style={{ position: "relative", minHeight: layerHeight + 90 }}>
        <div
          aria-hidden
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 34,
            borderTop: "2px solid var(--border, #d9dee7)",
          }}
        />

        {steps.map((step, idx) => {
          const leftPct = (idx / (slotCount - 1)) * 100;
          const statusTone =
            step.status === "done"
              ? "#10b981"
              : step.status === "active"
                ? "#3b82f6"
                : step.status === "failed"
                  ? "#ef4444"
                  : "var(--border, #d9dee7)";
          return (
            <div
              key={step.id}
              title={`${step.title} (${step.status})`}
              style={{
                position: "absolute",
                left: `${leftPct}%`,
                top: 16,
                transform: "translateX(-50%)",
                width: 128,
                textAlign: "center",
              }}
            >
              <div
                aria-hidden
                style={{
                  width: 16,
                  height: 16,
                  margin: "0 auto",
                  borderRadius: "50%",
                  border: "2px solid #fff",
                  background: statusTone,
                  boxShadow: "0 0 0 1px rgba(0,0,0,0.08)",
                }}
              />
              <div style={{ marginTop: 9, fontSize: 12, fontWeight: 600, lineHeight: 1.2 }}>
                {step.title}
              </div>
            </div>
          );
        })}

        <div
          title="Done"
          style={{
            position: "absolute",
            left: "100%",
            top: 16,
            transform: "translateX(-50%)",
            width: 84,
            textAlign: "center",
          }}
        >
          <div
            aria-hidden
            style={{
              width: 16,
              height: 16,
              margin: "0 auto",
              borderRadius: "50%",
              border: "2px solid #fff",
              background: "#10b981",
              boxShadow: "0 0 0 1px rgba(0,0,0,0.08)",
            }}
          />
          <div style={{ marginTop: 9, fontSize: 12, fontWeight: 700, lineHeight: 1.2 }}>Done</div>
        </div>

        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 58,
            minHeight: layerHeight,
            pointerEvents: "none",
          }}
        >
          {figures.map((f, lane) => {
            const leftPct = (f.targetSlot / (slotCount - 1)) * 100;
            const color = roleColor(f.role);
            return (
              <div
                key={f.id}
                style={{
                  position: "absolute",
                  left: 0,
                  top: lane * 34,
                  transform: `translateX(calc(${leftPct}% - 50%))`,
                  transition: "transform 700ms ease",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                {renderAgentFigure ? (
                  renderAgentFigure({
                    role: f.role,
                    terminal: f.terminal,
                    statusText: f.statusText,
                    label: f.label,
                  })
                ) : (
                  <DefaultAgentFigure role={f.role} terminal={f.terminal} statusText={f.statusText} />
                )}
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    lineHeight: 1,
                    border: `1px solid ${color}4d`,
                    background: `${color}14`,
                    color,
                    borderRadius: 999,
                    padding: "0.28rem 0.5rem",
                    whiteSpace: "nowrap",
                  }}
                >
                  {f.label} · {f.statusText || capitalize(f.terminal ? "done" : "active")}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

