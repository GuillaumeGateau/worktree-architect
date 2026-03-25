import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import { join, dirname } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { nanoid } from "nanoid";
import type { JobEnvelope, JobStatus, FeatureRun, FeatureStep, ActivityEvent } from "@orch-os/core";
import {
  canTransition,
  CreateFeatureBodySchema,
  PatchFeatureBodySchema,
  AppendActivityBodySchema,
  PatchStepBodySchema,
} from "@orch-os/core";
import {
  openDb,
  listJobs,
  getJob,
  insertJob,
  updateJobStatus,
  registerWorker,
  countWorkers,
} from "./db.js";
import {
  listFeatures,
  getFeature,
  createFeature,
  patchFeature,
  mergeFeatureLinks,
  startFeature,
  cancelFeature,
  listSteps,
  replaceSteps,
  patchStep,
  appendActivity,
  listActivity,
} from "./db-features.js";
import {
  buildCloudAgentPrompt,
  launchCloudAgent,
  scheduleCursorAgentStatusPoll,
} from "./cursor-cloud-agent.js";
import { resolveEffectiveCursorCloudForStart } from "./effective-cursor-cloud.js";
import { spawnFeatureStartCommand } from "./feature-start-hook.js";
import { bus, emitOrchestratorEvent } from "./event-bus.js";
import { writeStatusMd } from "./status-md.js";
import {
  loadOrchestratorConfig,
  resolveFeatureWorktree,
  type OrchestratorYamlConfig,
} from "./config.js";
import { createWorktreeForFeature, spawnCursorOpenWorktree } from "./feature-worktree.js";

const require = createRequire(import.meta.url);

export type ServerOptions = {
  cwd: string;
  staticRoot?: string;
  apiKey?: string;
  config?: OrchestratorYamlConfig;
};

function featureToJSON(r: FeatureRun) {
  return {
    id: r.id,
    title: r.title,
    summary: r.summary,
    status: r.status,
    risks: r.risks,
    dependencies: r.dependencies,
    links: r.linksJson ? JSON.parse(r.linksJson) : undefined,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

function stepToJSON(s: FeatureStep) {
  return {
    id: s.id,
    featureId: s.featureId,
    ordinal: s.ordinal,
    title: s.title,
    summary: s.summary,
    status: s.status,
    meta: s.metaJson ? (JSON.parse(s.metaJson) as Record<string, unknown>) : undefined,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}

function activityToJSON(a: ActivityEvent) {
  return {
    id: a.id,
    featureId: a.featureId,
    stepId: a.stepId,
    kind: a.kind,
    message: a.message,
    details: a.detailsJson ? (JSON.parse(a.detailsJson) as Record<string, unknown>) : undefined,
    createdAt: a.createdAt,
  };
}

function resolveUiDist(): string {
  try {
    const pkg = dirname(require.resolve("@orch-os/ui/package.json"));
    return join(pkg, "dist");
  } catch {
    return join(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "ui", "dist");
  }
}

export async function buildServer(opts: ServerOptions) {
  const cwd = opts.cwd;
  if (process.env.REDIS_URL) {
    // Scale profile adapter is optional; SQLite + SSE remain authoritative in v1.
    process.stderr.write(
      "[orch-os] REDIS_URL is set; Redis fan-out is not enabled in this build (see docs/ARCHITECTURE.md).\n"
    );
  }
  const yamlConfig = opts.config ?? loadOrchestratorConfig(cwd);
  const sqlitePath = join(cwd, yamlConfig.sqlitePath ?? ".orchestrator/orchestrator.db");
  const statusMdPath = join(cwd, yamlConfig.statusMdPath ?? ".orchestrator/STATUS.md");
  const db = openDb(sqlitePath);
  const staticRoot = opts.staticRoot ?? resolveUiDist();

  const app = Fastify({ logger: false });

  const requireKey = opts.apiKey;

  app.addHook("onRequest", async (req, reply) => {
    if (req.url.startsWith("/api/")) {
      if (requireKey) {
        const k = req.headers["x-api-key"];
        if (k !== requireKey) {
          reply.code(401).send({ error: "unauthorized" });
          return;
        }
      }
    }
  });

  app.get("/api/v1/health", async () => ({ ok: true }));

  app.get("/api/v1/summary", async () => {
    const jobs = listJobs(db);
    const byStatus: Record<string, number> = {};
    for (const j of jobs) {
      byStatus[j.status] = (byStatus[j.status] ?? 0) + 1;
    }
    const features = listFeatures(db);
    const featureByStatus: Record<string, number> = {};
    for (const f of features) {
      featureByStatus[f.status] = (featureByStatus[f.status] ?? 0) + 1;
    }
    return {
      jobsTotal: jobs.length,
      byStatus,
      featuresTotal: features.length,
      featuresByStatus: featureByStatus,
      activeWorkers: countWorkers(db),
      maxParallelWorkers: yamlConfig.maxParallelWorkers ?? 8,
    };
  });

  app.get("/api/v1/jobs", async () => ({ jobs: listJobs(db) }));

  app.get<{ Params: { id: string } }>("/api/v1/jobs/:id", async (req, reply) => {
    const job = getJob(db, req.params.id);
    if (!job) {
      reply.code(404).send({ error: "not_found" });
      return;
    }
    return job;
  });

  app.post<{
    Body: {
      contractVersion?: number;
      role?: string;
      payload?: Record<string, unknown>;
      worktreePath?: string;
      branch?: string;
    };
  }>("/api/v1/jobs", async (req) => {
    const now = new Date().toISOString();
    const id = nanoid(12);
    const job: JobEnvelope = {
      id,
      contractVersion: req.body.contractVersion ?? 1,
      role: req.body.role,
      status: "queued",
      worktreePath: req.body.worktreePath,
      branch: req.body.branch,
      payload: req.body.payload,
      createdAt: now,
      updatedAt: now,
    };
    insertJob(db, job);
    emitOrchestratorEvent({ type: "job_created", jobId: id });
    refreshStatusMd();
    return job;
  });

  app.patch<{
    Params: { id: string };
    Body: Partial<{
      status: JobStatus;
      blockedReason: string;
      workerId: string;
      role: string;
      worktreePath: string;
      branch: string;
      payload: Record<string, unknown>;
    }>;
  }>("/api/v1/jobs/:id", async (req, reply) => {
    const existing = getJob(db, req.params.id);
    if (!existing) {
      reply.code(404).send({ error: "not_found" });
      return;
    }
    const nextStatus = req.body.status;
    if (nextStatus && !canTransition(existing.status, nextStatus)) {
      reply.code(400).send({
        error: "invalid_transition",
        from: existing.status,
        to: nextStatus,
      });
      return;
    }
    const now = new Date().toISOString();
    const updated = updateJobStatus(db, req.params.id, { ...req.body }, now);
    emitOrchestratorEvent({ type: "job_updated", jobId: req.params.id });
    refreshStatusMd();
    return updated;
  });

  app.get("/api/v1/features", async () => ({
    features: listFeatures(db).map(featureToJSON),
  }));

  app.post("/api/v1/features", async (req, reply) => {
    const parsed = CreateFeatureBodySchema.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400).send({ error: "invalid_body", details: parsed.error.flatten() });
      return;
    }
    const { run } = createFeature(db, parsed.data);
    emitOrchestratorEvent({ type: "feature_created", featureId: run.id });
    return featureToJSON(run);
  });

  app.get<{ Params: { id: string } }>("/api/v1/features/:id", async (req, reply) => {
    const run = getFeature(db, req.params.id);
    if (!run) {
      reply.code(404).send({ error: "not_found" });
      return;
    }
    return {
      feature: featureToJSON(run),
      steps: listSteps(db, run.id).map(stepToJSON),
    };
  });

  app.patch<{ Params: { id: string }; Body: unknown }>(
    "/api/v1/features/:id",
    async (req, reply) => {
      const parsed = PatchFeatureBodySchema.safeParse(req.body);
      if (!parsed.success) {
        reply.code(400).send({ error: "invalid_body", details: parsed.error.flatten() });
        return;
      }
      const cur = getFeature(db, req.params.id);
      if (
        parsed.data.status === "executing" &&
        cur &&
        cur.status !== "executing"
      ) {
        reply.code(400).send({
          error: "use_post_start",
          message:
            "Transition to executing must use POST /api/v1/features/:id/start (worktree, hooks, activity). PATCH cannot replace Start.",
        });
        return;
      }
      const updated = patchFeature(db, req.params.id, parsed.data);
      if (!updated) {
        reply.code(404).send({ error: "not_found" });
        return;
      }
      emitOrchestratorEvent({ type: "feature_updated", featureId: req.params.id });
      return featureToJSON(updated);
    }
  );

  app.post<{ Params: { id: string } }>(
    "/api/v1/features/:id/start",
    async (req, reply) => {
      const fid = req.params.id;
      const updated = startFeature(db, fid);
      if (!updated) {
        const cur = getFeature(db, fid);
        if (!cur) {
          reply.code(404).send({ error: "not_found" });
          return;
        }
        reply.code(400).send({ error: "cannot_start", status: cur.status });
        return;
      }
      emitOrchestratorEvent({ type: "feature_updated", featureId: fid });
      const stepsAfter = listSteps(db, fid);
      for (const s of stepsAfter) {
        if (s.status === "active") {
          emitOrchestratorEvent({
            type: "step_updated",
            featureId: fid,
            stepId: s.id,
          });
        }
      }

      const cc = resolveEffectiveCursorCloudForStart(yamlConfig, cwd);
      const apiKeyEnv = cc?.apiKeyEnv ?? "CURSOR_API_KEY";
      const apiKey = cc?.enabled ? process.env[apiKeyEnv]?.trim() : undefined;
      const usedInferredAutoCloud = Boolean(
        cc?.enabled &&
          yamlConfig.cursorCloudAgent?.enabled !== true &&
          yamlConfig.autoCursorCloudAgentOnStart !== false
      );

      const emitActivity = (ev: ReturnType<typeof appendActivity>) => {
        if (ev) {
          emitOrchestratorEvent({
            type: "activity_appended",
            featureId: fid,
            activityId: ev.id,
          });
        }
      };

      const activeStep = stepsAfter.find((s) => s.status === "active");
      const activeStepId = activeStep?.id;

      const fw = resolveFeatureWorktree(yamlConfig);
      let worktreePath: string | undefined;
      let worktreeBranch: string | undefined;
      let featureStartMode = "plan_only";
      let cloudLaunched = false;

      const evProv = appendActivity(db, fid, {
        kind: "plan",
        message:
          "Provisioning execution environment (git worktree when enabled, optional Cursor Cloud Agent, local start hook)…",
        stepId: activeStepId,
      });
      if (!evProv) {
        throw new Error("appendActivity(provisioning) failed — feature row missing after startFeature");
      }
      emitActivity(evProv);
      emitOrchestratorEvent({ type: "feature_updated", featureId: fid });

      if (fw.enabled) {
        const wt = await createWorktreeForFeature({
          repoRoot: cwd,
          featureId: fid,
          rootRel: fw.root,
          branchPrefix: fw.branchPrefix,
        });
        if (wt.ok) {
          worktreePath = wt.path;
          worktreeBranch = wt.branch;
          mergeFeatureLinks(db, fid, {
            worktreePath: wt.path,
            worktreeBranch: wt.branch,
            worktreeCreatedAt: new Date().toISOString(),
          });
          const ev = appendActivity(db, fid, {
            kind: "tool",
            message: `Created git worktree at ${wt.path} (branch ${wt.branch}).`,
            stepId: activeStepId,
          });
          if (ev) emitActivity(ev);
        } else {
          mergeFeatureLinks(db, fid, { worktreeError: wt.error });
          const ev = appendActivity(db, fid, {
            kind: "error",
            message: `Worktree not created: ${wt.error}. Hooks use repository root.`,
            stepId: activeStepId,
          });
          if (ev) emitActivity(ev);
        }
        emitOrchestratorEvent({ type: "feature_updated", featureId: fid });
      }

      const hookCwd = worktreePath ?? cwd;
      const defaultWorkerPath = join(cwd, "scripts", "orch-feature-start-worker.mjs");
      let hookCommand: string | string[] | undefined = yamlConfig.featureStartCommand;
      if (!hookCommand && fw.spawnDefaultHook) {
        if (existsSync(defaultWorkerPath)) {
          hookCommand = [process.execPath, defaultWorkerPath];
        } else {
          const evMiss = appendActivity(db, fid, {
            kind: "note",
            message: `Default start worker missing (${defaultWorkerPath}); skipping.`,
            stepId: activeStepId,
          });
          if (evMiss) emitActivity(evMiss);
        }
      }

      try {
        if (cc?.enabled) {
          if (!cc.repository?.trim()) {
            featureStartMode = "cloud_missing_repository";
            mergeFeatureLinks(db, fid, { featureStartMode });
            const ev = appendActivity(db, fid, {
              kind: "error",
              message:
                "Cursor Cloud is enabled but repository is missing and could not be inferred from git remote origin — set cursorCloudAgent.repository (GitHub HTTPS URL) or add `git remote add origin https://github.com/org/repo`.",
              stepId: activeStepId,
            });
            if (ev) emitActivity(ev);
            emitOrchestratorEvent({ type: "feature_updated", featureId: fid });
          } else if (!apiKey?.trim()) {
            featureStartMode = "cloud_missing_api_key";
            mergeFeatureLinks(db, fid, { featureStartMode });
            const ev = appendActivity(db, fid, {
              kind: "error",
              message: `cursorCloudAgent.enabled but no API key in env ${apiKeyEnv}.`,
              stepId: activeStepId,
            });
            if (ev) emitActivity(ev);
            emitOrchestratorEvent({ type: "feature_updated", featureId: fid });
          } else {
            const runRow = getFeature(db, fid)!;
            const links = runRow.linksJson
              ? (JSON.parse(runRow.linksJson) as Record<string, unknown>)
              : undefined;
            const branchSafe = fid.replace(/[^a-zA-Z0-9_-]/g, "-");
            const branchName = `${cc.branchNamePrefix}-${branchSafe}`.slice(0, 200);
            const promptText = buildCloudAgentPrompt({
              featureId: fid,
              title: runRow.title,
              summary: runRow.summary,
              steps: stepsAfter.map((s) => ({
                title: s.title,
                summary: s.summary,
                ordinal: s.ordinal,
              })),
              links,
              activityBaseUrl: process.env.ORCHESTRATOR_ACTIVITY_BASE_URL,
            });
            const launched = await launchCloudAgent({
              apiKey,
              repository: cc.repository.trim(),
              ref: cc.ref,
              model: cc.model,
              branchName,
              promptText,
            });
            featureStartMode = "cursor_cloud";
            cloudLaunched = true;
            mergeFeatureLinks(db, fid, {
              featureStartMode,
              cursorAgentId: launched.id,
              cursorAgentUrl: launched.targetUrl,
              cursorAgentBranch: launched.branchName,
              cursorAgentStatus: "CREATING",
            });
            const ev = appendActivity(db, fid, {
              kind: "agent",
              message: `Launched Cursor Cloud Agent ${launched.id} — ${launched.targetUrl}`,
              stepId: activeStepId,
            });
            if (ev) emitActivity(ev);
            emitOrchestratorEvent({ type: "feature_updated", featureId: fid });

            if (usedInferredAutoCloud) {
              mergeFeatureLinks(db, fid, { cursorCloudAutoLaunched: true });
              const evAuto = appendActivity(db, fid, {
                kind: "plan",
                message: `Cursor Cloud Agent launched automatically from git origin → ${cc.repository.trim()} (using ${apiKeyEnv}). Set autoCursorCloudAgentOnStart: false in orchestrator.config.yaml to disable.`,
                stepId: activeStepId,
              });
              if (evAuto) emitActivity(evAuto);
              emitOrchestratorEvent({ type: "feature_updated", featureId: fid });
            }

            if (cc.pollStatus) {
              const intervalMs = Math.max(5, cc.pollIntervalSeconds) * 1000;
              scheduleCursorAgentStatusPoll({
                featureId: fid,
                agentId: launched.id,
                apiKey,
                intervalMs,
                onUpdate: (status) => {
                  mergeFeatureLinks(db, fid, { cursorAgentStatus: status });
                  emitOrchestratorEvent({ type: "feature_updated", featureId: fid });
                },
                onTerminal: (status, summary) => {
                  mergeFeatureLinks(db, fid, { cursorAgentStatus: status });
                  const msg =
                    status === "FINISHED"
                      ? `Cursor Cloud Agent finished.${summary ? ` ${summary}` : ""}`
                      : `Cursor Cloud Agent ${status}.${summary ? ` ${summary}` : ""}`;
                  const terminal = appendActivity(db, fid, {
                    kind: status === "ERROR" ? "error" : "note",
                    message: msg.slice(0, 4000),
                    stepId: activeStepId,
                  });
                  if (terminal) emitActivity(terminal);
                  emitOrchestratorEvent({ type: "feature_updated", featureId: fid });
                },
              });
            }
          }
        }
      } catch (e) {
        const msg = (e as Error).message;
        featureStartMode = "cloud_launch_failed";
        mergeFeatureLinks(db, fid, { featureStartMode });
        const ev = appendActivity(db, fid, {
          kind: "error",
          message: `Cursor Cloud Agent launch failed: ${msg.slice(0, 3500)}`,
          stepId: activeStepId,
        });
        if (ev) emitActivity(ev);
        emitOrchestratorEvent({ type: "feature_updated", featureId: fid });
      }

      if (hookCommand) {
        if (
          featureStartMode !== "cursor_cloud" &&
          featureStartMode !== "cloud_missing_repository" &&
          featureStartMode !== "cloud_missing_api_key" &&
          featureStartMode !== "cloud_launch_failed"
        ) {
          featureStartMode = worktreePath ? "local_worktree" : "local_hook";
        }
        mergeFeatureLinks(db, fid, { featureStartMode });
        emitOrchestratorEvent({ type: "feature_updated", featureId: fid });
        spawnFeatureStartCommand(
          hookCommand,
          hookCwd,
          cwd,
          fid,
          worktreePath,
          (code, out, err) => {
            if (code !== 0 && code !== null) {
              const ev = appendActivity(db, fid, {
                kind: "error",
                message: `featureStartCommand failed (exit ${code}): ${(err || out || "").slice(0, 3500)}`,
                stepId: activeStepId,
              });
              if (ev) emitActivity(ev);
            } else {
              const ev = appendActivity(db, fid, {
                kind: "tool",
                message: "featureStartCommand completed (exit 0).",
                details: out?.trim() ? { stdoutTail: out.slice(-2000) } : undefined,
                stepId: activeStepId,
              });
              if (ev) emitActivity(ev);
            }
            emitOrchestratorEvent({ type: "feature_updated", featureId: fid });
          }
        );
      } else {
        if (featureStartMode === "plan_only" && worktreePath) {
          featureStartMode = "local_worktree";
        }
        mergeFeatureLinks(db, fid, { featureStartMode });
        if (!cloudLaunched && featureStartMode === "plan_only") {
          const planEv = appendActivity(db, fid, {
            kind: "plan",
            message:
              "No Cursor Cloud Agent and no local start hook ran. Work is manual: implement in your editor and log progress with orchestrator feature activity.",
            stepId: activeStepId,
          });
          if (planEv) emitActivity(planEv);
          const noteEv = appendActivity(db, fid, {
            kind: "note",
            message:
              "Tip: enable scripts/orch-feature-start-worker.mjs (default), set featureStartCommand, or configure cursorCloudAgent.",
            stepId: activeStepId,
          });
          if (noteEv) emitActivity(noteEv);
        } else if (!cloudLaunched && worktreePath) {
          const n = appendActivity(db, fid, {
            kind: "note",
            message: `Worktree ready at ${worktreePath}; no hook ran.`,
            stepId: activeStepId,
          });
          if (n) emitActivity(n);
        }
        emitOrchestratorEvent({ type: "feature_updated", featureId: fid });
      }

      if (fw.openWithCursor && worktreePath) {
        spawnCursorOpenWorktree(worktreePath, (msg, kind) => {
          const ev = appendActivity(db, fid, {
            kind: kind === "error" ? "error" : "note",
            message: msg,
            stepId: activeStepId,
          });
          if (ev) emitActivity(ev);
          emitOrchestratorEvent({ type: "feature_updated", featureId: fid });
        });
      }

      const summaryParts: string[] = [];
      if (worktreePath) summaryParts.push(`worktree ${worktreePath}`);
      if (cloudLaunched) summaryParts.push("cloud agent");
      if (hookCommand) summaryParts.push("local hook");
      const sumEv = appendActivity(db, fid, {
        kind: "note",
        message: `Start pipeline finished: ${summaryParts.length ? summaryParts.join(", ") : "database only"}.`,
        stepId: activeStepId,
      });
      if (sumEv) emitActivity(sumEv);
      emitOrchestratorEvent({ type: "feature_updated", featureId: fid });

      const finalRun = getFeature(db, fid);
      return featureToJSON(finalRun!);
    }
  );

  app.post<{ Params: { id: string } }>(
    "/api/v1/features/:id/cancel",
    async (req, reply) => {
      const updated = cancelFeature(db, req.params.id);
      if (!updated) {
        const cur = getFeature(db, req.params.id);
        if (!cur) {
          reply.code(404).send({ error: "not_found" });
          return;
        }
        reply.code(400).send({ error: "cannot_cancel", status: cur.status });
        return;
      }
      emitOrchestratorEvent({ type: "feature_updated", featureId: req.params.id });
      return featureToJSON(updated);
    }
  );

  app.put<{ Params: { id: string }; Body: { steps?: { title: string; summary?: string; id?: string; ordinal?: number }[] } }>(
    "/api/v1/features/:id/steps",
    async (req, reply) => {
      if (!getFeature(db, req.params.id)) {
        reply.code(404).send({ error: "not_found" });
        return;
      }
      const steps = replaceSteps(db, req.params.id, req.body?.steps ?? []);
      emitOrchestratorEvent({ type: "feature_updated", featureId: req.params.id });
      return { steps: steps.map(stepToJSON) };
    }
  );

  app.patch<{ Params: { id: string; stepId: string }; Body: unknown }>(
    "/api/v1/features/:id/steps/:stepId",
    async (req, reply) => {
      const parsed = PatchStepBodySchema.safeParse(req.body);
      if (!parsed.success) {
        reply.code(400).send({ error: "invalid_body", details: parsed.error.flatten() });
        return;
      }
      const updated = patchStep(db, req.params.id, req.params.stepId, parsed.data);
      if (!updated) {
        reply.code(404).send({ error: "not_found" });
        return;
      }
      emitOrchestratorEvent({
        type: "step_updated",
        featureId: req.params.id,
        stepId: req.params.stepId,
      });
      emitOrchestratorEvent({ type: "feature_updated", featureId: req.params.id });
      return stepToJSON(updated);
    }
  );

  app.post<{ Params: { id: string }; Body: unknown }>(
    "/api/v1/features/:id/activity",
    async (req, reply) => {
      const parsed = AppendActivityBodySchema.safeParse(req.body);
      if (!parsed.success) {
        reply.code(400).send({ error: "invalid_body", details: parsed.error.flatten() });
        return;
      }
      const ev = appendActivity(db, req.params.id, parsed.data);
      if (!ev) {
        reply.code(404).send({ error: "not_found" });
        return;
      }
      emitOrchestratorEvent({
        type: "activity_appended",
        featureId: req.params.id,
        activityId: ev.id,
      });
      emitOrchestratorEvent({ type: "feature_updated", featureId: req.params.id });
      return activityToJSON(ev);
    }
  );

  app.get<{ Params: { id: string }; Querystring: { limit?: string; since?: string } }>(
    "/api/v1/features/:id/activity",
    async (req, reply) => {
      if (!getFeature(db, req.params.id)) {
        reply.code(404).send({ error: "not_found" });
        return;
      }
      const limit = req.query?.limit ? Number(req.query.limit) : undefined;
      const since = req.query?.since ? String(req.query.since) : undefined;
      const events = listActivity(db, req.params.id, {
        limit,
        sinceCreatedAt: since,
      });
      return { activity: events.map(activityToJSON) };
    }
  );

  app.post<{
    Body: { workerId: string; capabilities?: string[]; host?: string };
  }>("/api/v1/workers/register", async (req) => {
    const now = new Date().toISOString();
    registerWorker(db, req.body.workerId, req.body.capabilities, req.body.host, now);
    return { ok: true };
  });

  app.get("/api/v1/events", async (req, reply) => {
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });
    const send = (obj: unknown) => {
      reply.raw.write(`data: ${JSON.stringify(obj)}\n\n`);
    };
    send({ type: "connected" });
    const onEv = (e: unknown) => {
      send(e);
    };
    bus.on("event", onEv);
    req.raw.on("close", () => {
      bus.off("event", onEv);
    });
    return reply;
  });

  const { existsSync } = await import("node:fs");
  if (existsSync(staticRoot)) {
    await app.register(fastifyStatic, {
      root: staticRoot,
      prefix: "/",
      decorateReply: false,
    });
  }

  app.setNotFoundHandler(async (req, reply) => {
    if (req.url.startsWith("/api/")) {
      reply.code(404).send({ error: "not_found" });
      return;
    }
    const indexHtml = join(staticRoot, "index.html");
    const fs = await import("node:fs/promises");
    const html = await fs.readFile(indexHtml, "utf8").catch(
      () => "<!doctype html><meta charset=utf-8><title>orch-os</title><p>UI not built. Run <code>npm run build -w @orch-os/ui</code></p>"
    );
    reply.type("text/html").send(html);
  });

  function refreshStatusMd(): void {
    try {
      writeStatusMd(statusMdPath, listJobs(db));
    } catch {
      /* ignore */
    }
  }

  app.addHook("onClose", async () => {
    db.close();
  });

  return app;
}
