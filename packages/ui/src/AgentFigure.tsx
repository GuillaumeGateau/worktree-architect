import type { CSSProperties } from "react";
import type { AgentStageFigureRole, AgentStageFigureState } from "./feature-view-utils";

const DEFAULT_STATUS_TEXT: Record<AgentStageFigureState, string> = {
  idle: "Waiting",
  walking: "Walking to task",
  working: "Working",
  done: "Done",
};

type AgentFigureProps = {
  state: AgentStageFigureState;
  role?: AgentStageFigureRole;
  statusLabel?: string;
  title?: string;
  className?: string;
  size?: number;
};

function classNames(parts: Array<string | undefined | false | null>): string {
  return parts.filter(Boolean).join(" ");
}

export function AgentFigure({
  state,
  role = "agent",
  statusLabel,
  title,
  className,
  size = 72,
}: AgentFigureProps) {
  const label = statusLabel ?? DEFAULT_STATUS_TEXT[state];
  const style = { "--agent-size": `${size}px` } as CSSProperties;
  const rootClassName = classNames([
    "agent-figure",
    `agent-figure--${role}`,
    `agent-figure--${state}`,
    className,
  ]);

  return (
    <figure className={rootClassName} data-role={role} data-state={state} style={style}>
      <svg
        className="agent-figure-svg"
        viewBox="0 0 64 88"
        role="img"
        aria-label={title ?? `${role} ${label}`}
      >
        {title ? <title>{title}</title> : null}
        <g className="agent-shadow" aria-hidden="true">
          <ellipse cx="32" cy="82" rx="16" ry="4.5" />
        </g>
        <g className="agent-body" aria-hidden="true">
          <circle className="agent-halo" cx="32" cy="18" r="12" />
          <circle className="agent-head" cx="32" cy="18" r="8" />
          <line className="agent-torso" x1="32" y1="27" x2="32" y2="56" />
          <line className="agent-arm agent-arm-left" x1="32" y1="35" x2="20" y2="47" />
          <line className="agent-arm agent-arm-right" x1="32" y1="35" x2="44" y2="47" />
          <line className="agent-leg agent-leg-left" x1="32" y1="56" x2="22" y2="74" />
          <line className="agent-leg agent-leg-right" x1="32" y1="56" x2="42" y2="74" />
        </g>
        {role === "auditor" ? (
          <g className="agent-role-mark" aria-hidden="true">
            <circle cx="49" cy="14" r="4.5" />
            <line x1="52" y1="17" x2="57" y2="22" />
          </g>
        ) : null}
      </svg>
      <figcaption className="agent-figure-label">{label}</figcaption>
    </figure>
  );
}

export default AgentFigure;
