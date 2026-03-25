import { z } from "zod";

export const FeatureStatusSchema = z.enum([
  "draft",
  "ready",
  "executing",
  "completed",
  "failed",
  "cancelled",
]);
export type FeatureStatus = z.infer<typeof FeatureStatusSchema>;

export const StepStatusSchema = z.enum([
  "pending",
  "active",
  "done",
  "failed",
  "blocked",
  "skipped",
]);
export type StepStatus = z.infer<typeof StepStatusSchema>;

export const ActivityKindSchema = z.enum([
  "plan",
  "agent",
  "tool",
  "error",
  "merge",
  "note",
]);
export type ActivityKind = z.infer<typeof ActivityKindSchema>;

/** Step definition embedded in create/patch plan */
export const FeatureStepInputSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1),
  summary: z.string().optional(),
  ordinal: z.number().int().nonnegative().optional(),
});
export type FeatureStepInput = z.infer<typeof FeatureStepInputSchema>;

export const FeatureRunSchema = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string().optional(),
  status: FeatureStatusSchema,
  risks: z.string().optional(),
  dependencies: z.string().optional(),
  linksJson: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type FeatureRun = z.infer<typeof FeatureRunSchema>;

export const FeatureStepSchema = z.object({
  id: z.string(),
  featureId: z.string(),
  ordinal: z.number().int().nonnegative(),
  title: z.string(),
  summary: z.string().optional(),
  status: StepStatusSchema,
  metaJson: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type FeatureStep = z.infer<typeof FeatureStepSchema>;

export const FeatureTaskStatusSchema = z.enum([
  "pending",
  "active",
  "done",
  "failed",
  "blocked",
]);
export type FeatureTaskStatus = z.infer<typeof FeatureTaskStatusSchema>;

export const FeatureTaskSchema = z.object({
  id: z.string(),
  featureId: z.string(),
  ordinal: z.number().int().nonnegative(),
  title: z.string(),
  summary: z.string().optional(),
  dependsOn: z.array(z.string()),
  status: FeatureTaskStatusSchema,
  agentId: z.string().optional(),
  branch: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type FeatureTask = z.infer<typeof FeatureTaskSchema>;

export const ActivityEventSchema = z.object({
  id: z.string(),
  featureId: z.string(),
  stepId: z.string().optional(),
  kind: ActivityKindSchema,
  message: z.string(),
  detailsJson: z.string().optional(),
  createdAt: z.string(),
});
export type ActivityEvent = z.infer<typeof ActivityEventSchema>;

/** POST /features body */
export const CreateFeatureBodySchema = z.object({
  title: z.string().min(1),
  summary: z.string().optional(),
  status: FeatureStatusSchema.optional(),
  risks: z.string().optional(),
  dependencies: z.string().optional(),
  links: z.record(z.unknown()).optional(),
  steps: z.array(FeatureStepInputSchema).optional(),
});
export type CreateFeatureBody = z.infer<typeof CreateFeatureBodySchema>;

export const PatchFeatureBodySchema = z.object({
  title: z.string().optional(),
  summary: z.string().optional(),
  status: FeatureStatusSchema.optional(),
  risks: z.string().optional(),
  dependencies: z.string().optional(),
  links: z.record(z.unknown()).optional(),
});
export type PatchFeatureBody = z.infer<typeof PatchFeatureBodySchema>;

export const AppendActivityBodySchema = z.object({
  kind: ActivityKindSchema,
  message: z.string().min(1),
  stepId: z.string().optional(),
  details: z.record(z.unknown()).optional(),
});
export type AppendActivityBody = z.infer<typeof AppendActivityBodySchema>;

export const PatchStepBodySchema = z.object({
  status: StepStatusSchema.optional(),
  title: z.string().optional(),
  summary: z.string().optional(),
  meta: z.record(z.unknown()).optional(),
});
export type PatchStepBody = z.infer<typeof PatchStepBodySchema>;
