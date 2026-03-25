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
};
