import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { nanoid } from "nanoid";
import type { JobEnvelope, JobStatus } from "@orch-os/core";
import { canTransition } from "@orch-os/core";
import {
  openDb,
  listJobs,
  getJob,
  insertJob,
  updateJobStatus,
  registerWorker,
  countWorkers,
} from "./db.js";
import { bus, emitOrchestratorEvent } from "./event-bus.js";
import { writeStatusMd } from "./status-md.js";
import { loadOrchestratorConfig, type OrchestratorYamlConfig } from "./config.js";

const require = createRequire(import.meta.url);

export type ServerOptions = {
  cwd: string;
  staticRoot?: string;
  apiKey?: string;
  config?: OrchestratorYamlConfig;
};

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
    return {
      jobsTotal: jobs.length,
      byStatus,
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
