export type JobRow = {
  id: string;
  contractVersion: number;
  role?: string;
  status: string;
  blockedReason?: string;
  worktreePath?: string;
  branch?: string;
  workerId?: string;
  createdAt: string;
  updatedAt: string;
};

export type Summary = {
  jobsTotal: number;
  byStatus: Record<string, number>;
  activeWorkers: number;
  maxParallelWorkers: number;
  featuresTotal?: number;
  featuresByStatus?: Record<string, number>;
};

export type FeatureRow = {
  id: string;
  title: string;
  summary?: string;
  status: string;
  risks?: string;
  dependencies?: string;
  links?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type FeatureStepRow = {
  id: string;
  featureId: string;
  ordinal: number;
  title: string;
  summary?: string;
  status: string;
  meta?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type ActivityEventRow = {
  id: string;
  featureId: string;
  stepId?: string;
  kind: string;
  message: string;
  details?: Record<string, unknown>;
  createdAt: string;
};

export type FeatureDetailPayload = {
  feature: FeatureRow;
  steps: FeatureStepRow[];
  tasks?: FeatureTaskRow[];
  mergeOutcomes?: FeatureMergeOutcomes;
};

export type TaskIntegrationState =
  | "not_completed"
  | "merged"
  | "merge_skipped"
  | "pending_merge_outcome";

export type FeatureTaskRow = {
  id: string;
  featureId: string;
  ordinal: number;
  title: string;
  summary?: string;
  dependsOn: string;
  status: string;
  agentId?: string;
  branch?: string;
  createdAt: string;
  updatedAt: string;
  integrationState?: TaskIntegrationState;
};

export type FeatureMergeOutcomes = {
  taskCounts: {
    total: number;
    pending: number;
    active: number;
    done: number;
    failed: number;
    blocked: number;
    other: number;
    terminal: number;
  };
  mergeCounts: {
    merged: number;
    skipped: number;
    pending: number;
  };
  mismatch: {
    hasMismatch: boolean;
    completedTasks: number;
    integratedTasks: number;
    completedWithoutIntegration: number;
    integratedWithoutCompletion: number;
  };
};
