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
};
