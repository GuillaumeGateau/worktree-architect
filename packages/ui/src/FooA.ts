import type { DeskDerivedState } from "./feature-view-utils";

export function FooA(state: DeskDerivedState): string {
  if (state.desks.length === 0) return "no desks yet";

  const byState = state.desks.reduce<Record<string, number>>((acc, desk) => {
    acc[desk.deskState] = (acc[desk.deskState] ?? 0) + 1;
    return acc;
  }, {});

  const summary = ["arriving", "active", "complete", "empty"]
    .map((k) => `${k}:${byState[k] ?? 0}`)
    .join(" ");

  return `${state.desks.length} desks (${summary})`;
}
