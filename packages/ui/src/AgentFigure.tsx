type AgentFigureProps = {
  name: string;
  statusLabel: string;
  state: "idle" | "working" | "done" | "error";
};

export default function AgentFigure({ name, statusLabel, state }: AgentFigureProps) {
  return (
    <div className="agent-figure" data-state={state}>
      <div className="agent-bubble">{statusLabel}</div>
      <svg
        width="40"
        height="56"
        viewBox="0 0 40 56"
        className={state === "working" ? "agent-walking" : undefined}
        role="img"
        aria-label={`${name} agent figure`}
      >
        <circle cx="20" cy="9" r="8" fill="none" stroke="currentColor" strokeWidth="2" />
        <line x1="20" y1="17" x2="20" y2="37" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <line x1="20" y1="27" x2="8" y2="20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <line x1="20" y1="27" x2="32" y2="20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <line x1="20" y1="37" x2="12" y2="52" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <line x1="20" y1="37" x2="28" y2="52" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </div>
  );
}
