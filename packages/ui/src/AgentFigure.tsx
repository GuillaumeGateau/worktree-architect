type AgentFigureState = "idle" | "working" | "done" | "error";

type AgentFigureProps = {
  name: string;
  statusLabel: string;
  state: AgentFigureState;
};

export default function AgentFigure({ name, statusLabel, state }: AgentFigureProps) {
  const figureClassName = `agent-figure${state === "working" ? " agent-walking" : ""}`;

  return (
    <div className={figureClassName} aria-label={`${name} status: ${state}`}>
      <div className="agent-bubble" aria-live="polite">
        {statusLabel}
      </div>
      <svg width={40} height={56} viewBox="0 0 40 56" role="img" aria-label={name}>
        <title>{name}</title>
        <circle cx="20" cy="10" r="6" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M20 16 L20 32" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M20 20 L12 26" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M20 20 L28 26" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M20 32 L14 46" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M20 32 L26 46" fill="none" stroke="currentColor" strokeWidth="2" />
        {state === "done" && (
          <path
            d="M27 8 L30 11 L35 5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </svg>
    </div>
  );
}
