import { useMemo, type ComponentType } from "react";
import * as AgentFigureModule from "./AgentFigure";
import type { FeatureStepRow } from "./types";
import type { AgentStageFigure } from "./feature-view-utils";

type AgentFigureComponentProps = {
  state?: string;
  role?: string;
  statusLabel?: string;
  className?: string;
  title?: string;
};

const AgentFigureComponent =
  (AgentFigureModule as { default?: ComponentType<AgentFigureComponentProps> }).default ??
  (AgentFigureModule as { AgentFigure?: ComponentType<AgentFigureComponentProps> }).AgentFigure ??
  (() => null);

type StepLike = Pick<FeatureStepRow, "id" | "ordinal" | "title" | "summary" | "status">;

export type AgentStageProps = {
  steps: StepLike[];
  figures: AgentStageFigure[];
  className?: string;
  heading?: string;
  ariaLabel?: string;
};

const STAGE_CSS = `
.agent-stage {
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface);
  padding: 0.9rem;
}

.agent-stage__head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem 1rem;
  margin-bottom: 0.75rem;
}

.agent-stage__title {
  margin: 0;
  font-size: 0.86rem;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--muted);
}

.agent-stage__meta {
  font-size: 0.72rem;
  color: var(--muted);
}

.agent-stage__track {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.agent-stage__node {
  position: relative;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 0.65rem 0.7rem;
  background: color-mix(in oklab, var(--surface) 90%, white 10%);
}

.agent-stage__node:not(:last-child)::after {
  content: "";
  position: absolute;
  left: 1.4rem;
  top: calc(100% + 0.1rem);
  width: 2px;
  height: 0.5rem;
  background: var(--border);
}

.agent-stage__node.is-active {
  border-color: #7dd3fc;
}

.agent-stage__node.is-done {
  border-color: var(--accent);
}

.agent-stage__node.is-failed {
  border-color: var(--danger);
}

.agent-stage__task {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 0.45rem;
}

.agent-stage__ordinal {
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 999px;
  border: 1px solid var(--border);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.72rem;
  font-family: var(--font-mono);
  color: var(--muted);
}

.agent-stage__task-title {
  font-size: 0.84rem;
  font-weight: 600;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-stage__task-status {
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--muted);
}

.agent-stage__task-summary {
  margin: 0.35rem 0 0;
  font-size: 0.76rem;
  color: var(--muted);
}

.agent-stage__figures {
  margin: 0.5rem 0 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 0.35rem;
}

.agent-stage__figure {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.35rem 0.45rem;
  border-radius: 8px;
  border: 1px solid color-mix(in oklab, var(--border) 85%, white 15%);
  background: color-mix(in oklab, var(--surface) 88%, white 12%);
}

.agent-stage__figure-copy {
  min-width: 0;
  display: grid;
}

.agent-stage__figure-name {
  font-size: 0.74rem;
  font-weight: 600;
  line-height: 1.2;
}

.agent-stage__figure-status {
  font-size: 0.68rem;
  color: var(--muted);
  line-height: 1.3;
}

.agent-stage__figure-time {
  margin-left: auto;
  font-family: var(--font-mono);
  font-size: 0.65rem;
  color: var(--muted);
}

.agent-stage__figure.is-walking {
  border-color: rgba(125, 211, 252, 0.45);
}

.agent-stage__figure.is-working {
  border-color: rgba(110, 231, 183, 0.45);
}

.agent-stage__figure.is-done {
  border-color: rgba(110, 231, 183, 0.7);
  background: color-mix(in oklab, var(--surface) 75%, #86efac 25%);
}

.agent-stage__figure.is-idle {
  opacity: 0.9;
}

.agent-stage__empty {
  font-size: 0.72rem;
  color: var(--muted);
  padding: 0.2rem 0.05rem;
}

.agent-stage__unassigned {
  margin-top: 0.8rem;
  border-top: 1px dashed var(--border);
  padding-top: 0.65rem;
}

.agent-stage__unassigned-title {
  margin: 0 0 0.35rem;
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--muted);
}

@media (prefers-reduced-motion: no-preference) {
  .agent-stage__figure.is-walking {
    animation: agent-stage-walk-pulse 1.2s ease-in-out infinite;
  }
}

@media (prefers-reduced-motion: reduce) {
  .agent-stage__figure.is-walking {
    animation: none;
  }
}

@keyframes agent-stage-walk-pulse {
  0%,
  100% {
    transform: translateX(0);
  }
  50% {
    transform: translateX(2px);
  }
}
`;

function sortStepsByOrdinal(steps: StepLike[]): StepLike[] {
  return [...steps].sort((a, b) => a.ordinal - b.ordinal);
}

function normalizeStatus(status: string): "active" | "done" | "failed" | "other" {
  const s = status.toLowerCase();
  if (s === "active") return "active";
  if (s === "done" || s === "completed" || s === "succeeded") return "done";
  if (s === "failed" || s === "blocked") return "failed";
  return "other";
}

function figureDisplayName(figure: AgentStageFigure): string {
  if (figure.role === "auditor") return "Merge auditor";
  if (figure.agentId) return `Agent ${figure.agentId.slice(0, 8)}...`;
  if (figure.taskOrdinal !== undefined) return `Task ${figure.taskOrdinal}`;
  return "Agent";
}

function toTimeLabel(value: string): string {
  const t = new Date(value).getTime();
  if (!Number.isFinite(t) || t <= 0) return "";
  return new Date(t).toLocaleTimeString();
}

export function AgentStage({
  steps,
  figures,
  className,
  heading = "Agent timeline",
  ariaLabel = "Agent timeline with task nodes",
}: AgentStageProps) {
  const orderedSteps = useMemo(() => sortStepsByOrdinal(steps), [steps]);

  const { byStepId, unassigned } = useMemo(() => {
    const result: Record<string, AgentStageFigure[]> = {};
    const overflow: AgentStageFigure[] = [];
    const stepByOrdinal = new Map(orderedSteps.map((s) => [s.ordinal, s]));

    for (const figure of figures) {
      let stepId = figure.stepId;
      if (!stepId && figure.stepOrdinal !== undefined) {
        stepId = stepByOrdinal.get(figure.stepOrdinal)?.id;
      }
      if (!stepId && figure.taskOrdinal !== undefined) {
        stepId = stepByOrdinal.get(figure.taskOrdinal)?.id;
      }

      if (!stepId) {
        overflow.push(figure);
        continue;
      }

      if (!result[stepId]) result[stepId] = [];
      result[stepId].push(figure);
    }

    for (const key of Object.keys(result)) {
      result[key].sort((a, b) => a.figureId.localeCompare(b.figureId));
    }
    overflow.sort((a, b) => a.figureId.localeCompare(b.figureId));
    return { byStepId: result, unassigned: overflow };
  }, [figures, orderedSteps]);

  return (
    <section className={`agent-stage ${className ?? ""}`} aria-label={ariaLabel}>
      <style>{STAGE_CSS}</style>
      <header className="agent-stage__head">
        <h3 className="agent-stage__title">{heading}</h3>
        <span className="agent-stage__meta">
          {orderedSteps.length} task nodes · {figures.length} figures
        </span>
      </header>

      <ol className="agent-stage__track">
        {orderedSteps.map((step) => {
          const taskFigures = byStepId[step.id] ?? [];
          const statusClass = normalizeStatus(step.status);
          return (
            <li key={step.id} className={`agent-stage__node is-${statusClass}`}>
              <div className="agent-stage__task">
                <span className="agent-stage__ordinal" aria-hidden>
                  {step.ordinal}
                </span>
                <span className="agent-stage__task-title">{step.title}</span>
                <span className="agent-stage__task-status">{step.status}</span>
              </div>
              {step.summary ? <p className="agent-stage__task-summary">{step.summary}</p> : null}

              <ul className="agent-stage__figures" aria-label={`Figures on task ${step.ordinal}`}>
                {taskFigures.length === 0 ? (
                  <li className="agent-stage__empty">No agent on this node yet.</li>
                ) : (
                  taskFigures.map((figure) => (
                    <li
                      key={figure.figureId}
                      className={`agent-stage__figure is-${figure.state}`}
                      title={figure.statusLabel}
                    >
                      <AgentFigureComponent
                        state={figure.state}
                        role={figure.role}
                        statusLabel={figure.statusLabel}
                        title={figure.statusLabel}
                      />
                      <div className="agent-stage__figure-copy">
                        <span className="agent-stage__figure-name">{figureDisplayName(figure)}</span>
                        <span className="agent-stage__figure-status">{figure.statusLabel}</span>
                      </div>
                      <span className="agent-stage__figure-time">{toTimeLabel(figure.updatedAt)}</span>
                    </li>
                  ))
                )}
              </ul>
            </li>
          );
        })}
      </ol>

      {unassigned.length > 0 ? (
        <div className="agent-stage__unassigned">
          <h4 className="agent-stage__unassigned-title">Merge and unassigned</h4>
          <ul className="agent-stage__figures" aria-label="Unassigned figures">
            {unassigned.map((figure) => (
              <li
                key={figure.figureId}
                className={`agent-stage__figure is-${figure.state}`}
                title={figure.statusLabel}
              >
                <AgentFigureComponent
                  state={figure.state}
                  role={figure.role}
                  statusLabel={figure.statusLabel}
                  title={figure.statusLabel}
                />
                <div className="agent-stage__figure-copy">
                  <span className="agent-stage__figure-name">{figureDisplayName(figure)}</span>
                  <span className="agent-stage__figure-status">{figure.statusLabel}</span>
                </div>
                <span className="agent-stage__figure-time">{toTimeLabel(figure.updatedAt)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

export default AgentStage;
