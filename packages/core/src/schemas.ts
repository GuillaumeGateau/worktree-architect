import { z } from "zod";

/** Job lifecycle — contract_version on jobs supports FE/BE escalation flows */
export const JobStatusSchema = z.enum([
  "queued",
  "claimed",
  "running",
  "succeeded",
  "failed",
  "blocked",
]);

export type JobStatus = z.infer<typeof JobStatusSchema>;

export const GateResultSchema = z.object({
  gateId: z.string(),
  passed: z.boolean(),
  message: z.string().optional(),
  details: z.record(z.unknown()).optional(),
});

export const JobEnvelopeSchema = z.object({
  id: z.string(),
  contractVersion: z.number().int().nonnegative(),
  role: z.string().optional(),
  status: JobStatusSchema,
  blockedReason: z.string().optional(),
  worktreePath: z.string().optional(),
  branch: z.string().optional(),
  workerId: z.string().optional(),
  payload: z.record(z.unknown()).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type JobEnvelope = z.infer<typeof JobEnvelopeSchema>;

export const WorkerRegistrationSchema = z.object({
  workerId: z.string(),
  capabilities: z.array(z.string()).optional(),
  host: z.string().optional(),
});

export const DashboardSummarySchema = z.object({
  jobsTotal: z.number(),
  byStatus: z.record(z.number()),
  activeWorkers: z.number(),
});

export const InstanceFileSchema = z.object({
  baseUrl: z.string().url(),
  port: z.number().int().positive(),
  pid: z.number().int().positive(),
  startedAt: z.string(),
  instanceToken: z.string(),
  apiKey: z.string().optional(),
});

export type InstanceFile = z.infer<typeof InstanceFileSchema>;
