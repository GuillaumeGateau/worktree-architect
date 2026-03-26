import { useMemo } from "react";
import type { AgentStageFigure } from "./feature-view-utils";

function roleLabel(role: AgentStageFigure["role"]): string {
  return role === "auditor" ? "Merge auditor" : "Task agent";
}

function deskTitle(figure: AgentStageFigure): string {
  if (figure.role === "auditor") return "Merge review desk";
  if (figure.taskOrdinal !== undefined) return `Task ${figure.taskOrdinal}`;
  if (figure.stepOrdinal !== undefined) return `Step ${figure.stepOrdinal}`;
  return "Unassigned task";
}

function deskSubtitle(figure: AgentStageFigure): string {
  if (figure.role === "auditor") return "Reviews final merge output";
  if (figure.stepOrdinal !== undefined) return `Plan step ${figure.stepOrdinal}`;
  if (figure.agentId) return `Agent ${figure.agentId.slice(0, 8)}…`;
  return "Waiting for next assignment";
}

function formatUpdatedTime(updatedAt: string): string {
  const t = new Date(updatedAt);
  if (Number.isNaN(t.getTime())) return "updated recently";
  return `updated ${t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

type Props = {
  figures: AgentStageFigure[];
};

export function DeskAgentAvatars({ figures }: Props) {
  const sortedFigures = useMemo(() => {
    return [...figures].sort((a, b) => {
      if (a.role !== b.role) return a.role === "agent" ? -1 : 1;
      const aOrdinal = a.taskOrdinal ?? a.stepOrdinal ?? Number.MAX_SAFE_INTEGER;
      const bOrdinal = b.taskOrdinal ?? b.stepOrdinal ?? Number.MAX_SAFE_INTEGER;
      return aOrdinal - bOrdinal;
    });
  }, [figures]);

  return (
    <section className="desk-avatars card" aria-label="Office desk agents">
      <div className="desk-avatars-head">
        <h3 className="subsection-title">Office desk roster</h3>
        <span className="muted-sm">
          {sortedFigures.length} active desk{sortedFigures.length === 1 ? "" : "s"}
        </span>
      </div>

      {sortedFigures.length === 0 ? (
        <p className="muted-sm">
          Agents will appear here once execution activity is emitted for this feature.
        </p>
      ) : (
        <ul className="desk-avatars-grid">
          {sortedFigures.map((figure) => (
            <li key={figure.figureId} className={`desk-avatar desk-avatar-${figure.state}`}>
              <div className="desk-avatar-headline">
                <span className={`badge desk-avatar-role desk-avatar-role-${figure.role}`}>
                  {roleLabel(figure.role)}
                </span>
                <span className="mono muted-sm desk-avatar-updated">
                  {formatUpdatedTime(figure.updatedAt)}
                </span>
              </div>

              <div className="desk-avatar-scene" aria-hidden="true">
                <span className="desk-avatar-chair" />
                <span className="desk-avatar-head-shape" />
                <span className="desk-avatar-body-shape" />
                <span className="desk-avatar-desk" />
                <span className="desk-avatar-monitor" />
              </div>

              <div className="desk-avatar-body">
                <p className="desk-avatar-title">{deskTitle(figure)}</p>
                <p className="desk-avatar-subtitle muted-sm">{deskSubtitle(figure)}</p>
                <span className={`desk-avatar-status desk-avatar-status-${figure.state}`}>
                  <span className="desk-avatar-status-dot" aria-hidden="true" />
                  <span className="desk-avatar-status-text">{figure.statusLabel}</span>
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
