import type { DeskDerivedState } from "./feature-view-utils";

function shortAgentId(agentId?: string): string {
  if (!agentId) return "unknown-agent";
  return agentId.length > 12 ? `${agentId.slice(0, 12)}…` : agentId;
}

export function FooB(state: DeskDerivedState): string {
  const activeDesk = state.desks.find((desk) => desk.deskState === "active");
  if (activeDesk) {
    return `${activeDesk.deskId} · ${shortAgentId(activeDesk.agentId)} · ${activeDesk.statusLabel}`;
  }
  const arrivingDesk = state.desks.find((desk) => desk.deskState === "arriving");
  if (arrivingDesk) return `${arrivingDesk.deskId} · ${arrivingDesk.statusLabel}`;
  if (state.desks.length === 0) return "desk map waiting for activity";
  return `${state.desks[0].deskId} · ${state.desks[0].statusLabel}`;
}
