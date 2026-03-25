import AgentFigure from "./AgentFigure";

type AgentStageTask = {
  id: string;
  ordinal: number;
  title: string;
  status: string;
};

type AgentStageProps = {
  tasks: AgentStageTask[];
};

function toFigureStatus(status: string): { statusLabel: string; state: "idle" | "working" | "done" } {
  if (status === "active") {
    return { statusLabel: "Working", state: "working" };
  }

  if (status === "done") {
    return { statusLabel: "Done", state: "done" };
  }

  return { statusLabel: "Waiting", state: "idle" };
}

export default function AgentStage({ tasks }: AgentStageProps) {
  return (
    <div className="agent-stage">
      <div className="stage-track">
        {tasks.map((task) => (
          <div key={task.id} className="stage-node">
            <div className="stage-node-ordinal">{task.ordinal}</div>
            <div className="stage-node-title">{task.title}</div>
          </div>
        ))}
      </div>
      <div className="stage-figures">
        {tasks.map((task) => {
          const figureStatus = toFigureStatus(task.status);

          return (
            <AgentFigure
              key={task.id}
              name={`Agent ${task.ordinal}`}
              statusLabel={figureStatus.statusLabel}
              state={figureStatus.state}
            />
          );
        })}
      </div>
    </div>
  );
}
