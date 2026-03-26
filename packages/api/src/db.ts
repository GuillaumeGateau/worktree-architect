import Database from "better-sqlite3";
import type { JobEnvelope, JobStatus } from "@orch-os/core";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export function openDb(sqlitePath: string): Database.Database {
  mkdirSync(dirname(sqlitePath), { recursive: true });
  const db = new Database(sqlitePath);
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      contract_version INTEGER NOT NULL DEFAULT 1,
      role TEXT,
      status TEXT NOT NULL,
      blocked_reason TEXT,
      worktree_path TEXT,
      branch TEXT,
      worker_id TEXT,
      payload_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS workers (
      worker_id TEXT PRIMARY KEY,
      capabilities_json TEXT,
      host TEXT,
      registered_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS feature_runs (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      summary TEXT,
      status TEXT NOT NULL,
      risks TEXT,
      dependencies TEXT,
      links_json TEXT,
      archived_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS feature_steps (
      id TEXT PRIMARY KEY,
      feature_id TEXT NOT NULL,
      ordinal INTEGER NOT NULL,
      title TEXT NOT NULL,
      summary TEXT,
      status TEXT NOT NULL,
      meta_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (feature_id) REFERENCES feature_runs(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_feature_steps_feature ON feature_steps(feature_id);
    CREATE TABLE IF NOT EXISTS feature_tasks (
      id TEXT PRIMARY KEY,
      feature_id TEXT NOT NULL REFERENCES feature_runs(id),
      ordinal INTEGER NOT NULL,
      title TEXT NOT NULL,
      summary TEXT,
      depends_on TEXT DEFAULT "[]",
      status TEXT NOT NULL DEFAULT "pending",
      agent_id TEXT,
      branch TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS activity_events (
      id TEXT PRIMARY KEY,
      feature_id TEXT NOT NULL,
      step_id TEXT,
      kind TEXT NOT NULL,
      message TEXT NOT NULL,
      details_json TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (feature_id) REFERENCES feature_runs(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_activity_feature ON activity_events(feature_id);
  `);
  // Forward-compatible migration for existing databases created before archive support.
  const featureRunColumns = db.prepare(`PRAGMA table_info(feature_runs)`).all() as Array<{
    name: string;
  }>;
  if (!featureRunColumns.some((c) => c.name === "archived_at")) {
    db.exec(`ALTER TABLE feature_runs ADD COLUMN archived_at TEXT`);
  }
  return db;
}

export function rowToJob(row: Record<string, unknown>): JobEnvelope {
  return {
    id: String(row.id),
    contractVersion: Number(row.contract_version),
    role: row.role ? String(row.role) : undefined,
    status: row.status as JobStatus,
    blockedReason: row.blocked_reason ? String(row.blocked_reason) : undefined,
    worktreePath: row.worktree_path ? String(row.worktree_path) : undefined,
    branch: row.branch ? String(row.branch) : undefined,
    workerId: row.worker_id ? String(row.worker_id) : undefined,
    payload: row.payload_json ? JSON.parse(String(row.payload_json)) : undefined,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function listJobs(db: Database.Database): JobEnvelope[] {
  const rows = db
    .prepare(
      `SELECT id, contract_version, role, status, blocked_reason, worktree_path, branch, worker_id, payload_json, created_at, updated_at FROM jobs ORDER BY created_at DESC`
    )
    .all() as Record<string, unknown>[];
  return rows.map(rowToJob);
}

export function getJob(db: Database.Database, id: string): JobEnvelope | undefined {
  const row = db
    .prepare(
      `SELECT id, contract_version, role, status, blocked_reason, worktree_path, branch, worker_id, payload_json, created_at, updated_at FROM jobs WHERE id = ?`
    )
    .get(id) as Record<string, unknown> | undefined;
  return row ? rowToJob(row) : undefined;
}

export function insertJob(
  db: Database.Database,
  job: Omit<JobEnvelope, "createdAt" | "updatedAt"> & { createdAt: string; updatedAt: string }
): void {
  db.prepare(
    `INSERT INTO jobs (id, contract_version, role, status, blocked_reason, worktree_path, branch, worker_id, payload_json, created_at, updated_at)
     VALUES (@id, @contractVersion, @role, @status, @blockedReason, @worktreePath, @branch, @workerId, @payloadJson, @createdAt, @updatedAt)`
  ).run({
    id: job.id,
    contractVersion: job.contractVersion,
    role: job.role ?? null,
    status: job.status,
    blockedReason: job.blockedReason ?? null,
    worktreePath: job.worktreePath ?? null,
    branch: job.branch ?? null,
    workerId: job.workerId ?? null,
    payloadJson: job.payload ? JSON.stringify(job.payload) : null,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  });
}

export function updateJobStatus(
  db: Database.Database,
  id: string,
  patch: Partial<Pick<JobEnvelope, "status" | "blockedReason" | "workerId" | "role" | "worktreePath" | "branch" | "payload">>,
  updatedAt: string
): JobEnvelope | undefined {
  const existing = getJob(db, id);
  if (!existing) return undefined;
  const next: JobEnvelope = {
    ...existing,
    ...patch,
    updatedAt,
  };
  db.prepare(
    `UPDATE jobs SET status = ?, blocked_reason = ?, worker_id = ?, role = ?, worktree_path = ?, branch = ?, payload_json = ?, updated_at = ? WHERE id = ?`
  ).run(
    next.status,
    next.blockedReason ?? null,
    next.workerId ?? null,
    next.role ?? null,
    next.worktreePath ?? null,
    next.branch ?? null,
    next.payload ? JSON.stringify(next.payload) : null,
    updatedAt,
    id
  );
  return getJob(db, id);
}

export function registerWorker(
  db: Database.Database,
  workerId: string,
  capabilities: string[] | undefined,
  host: string | undefined,
  registeredAt: string
): void {
  db.prepare(
    `INSERT INTO workers (worker_id, capabilities_json, host, registered_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(worker_id) DO UPDATE SET capabilities_json = excluded.capabilities_json, host = excluded.host, registered_at = excluded.registered_at`
  ).run(
    workerId,
    capabilities ? JSON.stringify(capabilities) : null,
    host ?? null,
    registeredAt
  );
}

export function countWorkers(db: Database.Database): number {
  const row = db.prepare(`SELECT COUNT(*) as c FROM workers`).get() as { c: number };
  return row.c;
}
