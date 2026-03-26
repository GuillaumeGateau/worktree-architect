import { useMemo } from "react";
import type { AgentStageFigure } from "./feature-view-utils";

type DeskRoleMarker = "worker" | "orchestrator" | "reviewer" | "tester";

function roleMarkerForFigure(role: AgentStageFigure["role"]): DeskRoleMarker {
  if (role === "reviewer") return "reviewer";
  if (role === "tester") return "tester";
  if (role === "auditor") return "orchestrator";
  return "worker";
}

function roleLabel(marker: DeskRoleMarker): string {
  if (marker === "orchestrator") return "Orchestrator";
  if (marker === "reviewer") return "Reviewer";
  if (marker === "tester") return "Tester";
  return "Worker";
}

function roleInitial(marker: DeskRoleMarker): string {
  if (marker === "orchestrator") return "O";
  if (marker === "reviewer") return "R";
  if (marker === "tester") return "T";
  return "W";
}

function deskTitle(figure: AgentStageFigure): string {
  if (figure.role === "auditor") return "Orchestration desk";
  if (figure.role === "reviewer") return "Review desk";
  if (figure.role === "tester") return "Validation desk";
  if (figure.taskOrdinal !== undefined) return `Task ${figure.taskOrdinal}`;
  if (figure.stepOrdinal !== undefined) return `Step ${figure.stepOrdinal}`;
  return "Unassigned task";
}

function deskSubtitle(figure: AgentStageFigure): string {
  if (figure.role === "auditor") return "Coordinates merge readiness";
  if (figure.role === "reviewer") return "Checks integrated code quality";
  if (figure.role === "tester") return "Validates runtime behavior";
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
  const roleLegend: DeskRoleMarker[] = ["worker", "orchestrator", "reviewer", "tester"];
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
        <h3 className="subsection-title">Office agents</h3>
        <span className="muted-sm">
          {sortedFigures.length} desk persona{sortedFigures.length === 1 ? "" : "s"}
        </span>
      </div>
      <ul className="desk-role-legend" aria-label="Desk role markers">
        {roleLegend.map((marker) => (
          <li key={marker} className={`desk-role-pill desk-role-pill-${marker}`}>
            <span
              className={`desk-avatar-role-marker desk-avatar-role-marker-${marker}`}
              aria-hidden="true"
            >
              {roleInitial(marker)}
            </span>
            <span>{roleLabel(marker)}</span>
          </li>
        ))}
      </ul>

      {sortedFigures.length === 0 ? (
        <p className="muted-sm">
          Agents will appear here once execution activity is emitted for this feature.
        </p>
      ) : (
        <ul className="desk-avatars-grid">
          {sortedFigures.map((figure) => {
            const marker = roleMarkerForFigure(figure.role);
            return (
              <li
                key={figure.figureId}
                className={`desk-avatar desk-avatar-${figure.state} desk-avatar-role-${marker}`}
              >
                <div className="desk-avatar-headline">
                  <span className={`badge desk-avatar-role desk-avatar-role-${marker}`}>
                    {roleLabel(marker)}
                  </span>
                  <span className="mono muted-sm desk-avatar-updated">
                    {formatUpdatedTime(figure.updatedAt)}
                  </span>
                </div>

                <div className="desk-avatar-scene" aria-hidden="true">
                  <span className="desk-avatar-light" />
                  <span className="desk-avatar-chair" />
                  <span className={`desk-avatar-head-shape desk-avatar-head-shape-${marker}`} />
                  <span className={`desk-avatar-body-shape desk-avatar-body-shape-${marker}`} />
                  <span className="desk-avatar-arm-shape desk-avatar-arm-shape-left" />
                  <span className="desk-avatar-arm-shape desk-avatar-arm-shape-right" />
                  <span className="desk-avatar-desk" />
                  <span className="desk-avatar-keyboard" />
                  <span className="desk-avatar-monitor" />
                  <span className={`desk-avatar-role-marker desk-avatar-role-marker-${marker}`}>
                    {roleInitial(marker)}
                  </span>
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
            );
          })}
        </ul>
      )}
    </section>
  );
}
