import type { FeatureStatus, StepStatus } from "./features.js";

/** Terminal feature statuses */
export function isFeatureTerminal(status: FeatureStatus): boolean {
  return status === "completed" || status === "failed" || status === "cancelled";
}

export function canStartFeature(status: FeatureStatus): boolean {
  return status === "draft" || status === "ready";
}

export function canCancelFeature(status: FeatureStatus): boolean {
  if (isFeatureTerminal(status)) return false;
  return status === "draft" || status === "ready" || status === "executing";
}

export function nextStepStatuses(from: StepStatus): StepStatus[] {
  const m: Record<StepStatus, StepStatus[]> = {
    pending: ["active", "skipped", "blocked"],
    active: ["done", "failed", "blocked"],
    done: [],
    failed: ["pending"],
    blocked: ["pending", "active"],
    skipped: [],
  };
  return m[from] ?? [];
}
