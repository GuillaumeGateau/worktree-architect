import type { FeatureTaskRecord } from "./db-features.js";

export const COMPLETION_TRUTH_CONTRACT_VERSION = 1 as const;

export const TASK_TERMINAL_STATUSES = ["done", "failed", "blocked"] as const;
export type TaskTerminalStatus = (typeof TASK_TERMINAL_STATUSES)[number];

export type TaskIntegrationResult = "integrated" | "not_integrated" | "not_applicable";

/**
 * Explicit taxonomy for "task reached terminal but was not integrated".
 */
export const NON_INTEGRATED_COMPLETION_REASONS = [
  "missing_task_branch",
  "merge_not_attempted",
  "merge_failed",
  "integration_branch_unavailable",
] as const;
export type NonIntegratedCompletionReason = (typeof NON_INTEGRATED_COMPLETION_REASONS)[number];

export type TaskCompletionTruth = {
  taskId: string;
  taskStatus: string;
  taskTerminal: boolean;
  integrationResult: TaskIntegrationResult;
  nonIntegratedReason?: NonIntegratedCompletionReason;
  integratedBranch?: string;
  observedAt: string;
};

export type FeatureDoneGateFailureReason =
  | "tasks_not_terminal"
  | "task_failed"
  | "task_blocked"
  | "task_completed_without_integration"
  | "merge_auditor_not_finished"
  | "merge_auditor_failed";

export type FeatureDoneGateTruth = {
  done: boolean;
  allTasksTerminal: boolean;
  failedTaskIds: string[];
  blockedTaskIds: string[];
  nonIntegratedDoneTaskIds: string[];
  mergeAuditorStatus?: string;
  failureReasons: FeatureDoneGateFailureReason[];
};

type TaskLikeForGate = Pick<FeatureTaskRecord, "id" | "status">;

export function isTaskTerminalStatus(status: string): status is TaskTerminalStatus {
  return TASK_TERMINAL_STATUSES.includes(status as TaskTerminalStatus);
}

export function buildTaskCompletionTruth(input: {
  taskId: string;
  taskStatus: string;
  integrationResult: TaskIntegrationResult;
  nonIntegratedReason?: NonIntegratedCompletionReason;
  integratedBranch?: string;
  observedAt?: string;
}): TaskCompletionTruth {
  return {
    taskId: input.taskId,
    taskStatus: input.taskStatus,
    taskTerminal: isTaskTerminalStatus(input.taskStatus),
    integrationResult: input.integrationResult,
    nonIntegratedReason: input.nonIntegratedReason,
    integratedBranch: input.integratedBranch,
    observedAt: input.observedAt ?? new Date().toISOString(),
  };
}

export function evaluateFeatureDoneGate(input: {
  tasks: TaskLikeForGate[];
  taskTruthById: Record<string, TaskCompletionTruth | undefined>;
  requireMergeAuditorSuccess: boolean;
  mergeAuditorStatus?: string;
}): FeatureDoneGateTruth {
  const allTasksTerminal = input.tasks.every((t) => isTaskTerminalStatus(t.status));
  const failedTaskIds = input.tasks.filter((t) => t.status === "failed").map((t) => t.id);
  const blockedTaskIds = input.tasks.filter((t) => t.status === "blocked").map((t) => t.id);
  const doneTasks = input.tasks.filter((t) => t.status === "done");
  const nonIntegratedDoneTaskIds = doneTasks
    .filter((t) => input.taskTruthById[t.id]?.integrationResult !== "integrated")
    .map((t) => t.id);

  const failureReasons: FeatureDoneGateFailureReason[] = [];
  if (!allTasksTerminal) failureReasons.push("tasks_not_terminal");
  if (failedTaskIds.length > 0) failureReasons.push("task_failed");
  if (blockedTaskIds.length > 0) failureReasons.push("task_blocked");
  if (nonIntegratedDoneTaskIds.length > 0) {
    failureReasons.push("task_completed_without_integration");
  }

  if (input.requireMergeAuditorSuccess) {
    const status = input.mergeAuditorStatus;
    if (!status || status === "CREATING" || status === "RUNNING") {
      failureReasons.push("merge_auditor_not_finished");
    } else if (status !== "FINISHED") {
      failureReasons.push("merge_auditor_failed");
    }
  }

  return {
    done: failureReasons.length === 0,
    allTasksTerminal,
    failedTaskIds,
    blockedTaskIds,
    nonIntegratedDoneTaskIds,
    mergeAuditorStatus: input.mergeAuditorStatus,
    failureReasons,
  };
}
