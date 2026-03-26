import type Database from "better-sqlite3";
import { nanoid } from "nanoid";
import type {
  ActivityEvent,
  CreateFeatureBody,
  FeatureListArchiveFilter,
  FeatureRun,
  FeatureStep,
  PatchFeatureBody,
  PatchStepBody,
  AppendActivityBody,
  FeatureStatus,
  StepStatus,
} from "@orch-os/core";
import {
  canStartFeature,
  canCancelFeature,
} from "@orch-os/core";

export function rowToFeature(row: Record<string, unknown>): FeatureRun {
  const archivedRaw = row.archived;
  const archived =
    archivedRaw === 1 ||
    archivedRaw === "1" ||
    archivedRaw === true ||
    archivedRaw === "true";
  return {
    id: String(row.id),
    title: String(row.title),
    summary: row.summary ? String(row.summary) : undefined,
    status: row.status as FeatureStatus,
    archived,
    archivedAt: row.archived_at ? String(row.archived_at) : undefined,
    risks: row.risks ? String(row.risks) : undefined,
    dependencies: row.dependencies ? String(row.dependencies) : undefined,
    linksJson: row.links_json ? String(row.links_json) : undefined,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function rowToStep(row: Record<string, unknown>): FeatureStep {
  return {
    id: String(row.id),
    featureId: String(row.feature_id),
    ordinal: Number(row.ordinal),
    title: String(row.title),
    summary: row.summary ? String(row.summary) : undefined,
    status: row.status as StepStatus,
    metaJson: row.meta_json ? String(row.meta_json) : undefined,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function rowToActivity(row: Record<string, unknown>): ActivityEvent {
  return {
    id: String(row.id),
    featureId: String(row.feature_id),
    stepId: row.step_id ? String(row.step_id) : undefined,
    kind: row.kind as ActivityEvent["kind"],
    message: String(row.message),
    detailsJson: row.details_json ? String(row.details_json) : undefined,
    createdAt: String(row.created_at),
  };
}

export type FeatureTaskRecord = {
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
};

function rowToFeatureTask(row: Record<string, unknown>): FeatureTaskRecord {
  return {
    id: String(row.id),
    featureId: String(row.feature_id),
    ordinal: Number(row.ordinal),
    title: String(row.title),
    summary: row.summary ? String(row.summary) : undefined,
    dependsOn: row.depends_on ? String(row.depends_on) : "[]",
    status: String(row.status),
    agentId: row.agent_id ? String(row.agent_id) : undefined,
    branch: row.branch ? String(row.branch) : undefined,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function listFeatures(db: Database.Database): FeatureRun[] {
  const rows = db
    .prepare(
      `SELECT id, title, summary, status, archived, archived_at, risks, dependencies, links_json, created_at, updated_at
       FROM feature_runs ORDER BY updated_at DESC`
    )
    .all() as Record<string, unknown>[];
  return rows.map(rowToFeature);
}

export function listFeaturesByArchive(
  db: Database.Database,
  archiveFilter: FeatureListArchiveFilter
): FeatureRun[] {
  if (archiveFilter === "archived") {
    const rows = db
      .prepare(
        `SELECT id, title, summary, status, archived, archived_at, risks, dependencies, links_json, created_at, updated_at
         FROM feature_runs WHERE archived = 1 ORDER BY updated_at DESC`
      )
      .all() as Record<string, unknown>[];
    return rows.map(rowToFeature);
  }
  if (archiveFilter === "active") {
    const rows = db
      .prepare(
        `SELECT id, title, summary, status, archived, archived_at, risks, dependencies, links_json, created_at, updated_at
         FROM feature_runs WHERE archived = 0 ORDER BY updated_at DESC`
      )
      .all() as Record<string, unknown>[];
    return rows.map(rowToFeature);
  }
  const rows = db
    .prepare(
      `SELECT id, title, summary, status, archived, archived_at, risks, dependencies, links_json, created_at, updated_at
       FROM feature_runs ORDER BY updated_at DESC`
    )
    .all() as Record<string, unknown>[];
  return rows.map(rowToFeature);
}

export function getFeature(db: Database.Database, id: string): FeatureRun | undefined {
  const row = db
    .prepare(
      `SELECT id, title, summary, status, archived, archived_at, risks, dependencies, links_json, created_at, updated_at
       FROM feature_runs WHERE id = ?`
    )
    .get(id) as Record<string, unknown> | undefined;
  return row ? rowToFeature(row) : undefined;
}

export function createFeature(
  db: Database.Database,
  body: CreateFeatureBody
): { run: FeatureRun; steps: FeatureStep[] } {
  const now = new Date().toISOString();
  const id = nanoid(12);
  const status = body.status ?? "draft";
  const linksJson = body.links ? JSON.stringify(body.links) : null;
  db.prepare(
    `INSERT INTO feature_runs (id, title, summary, status, archived, archived_at, risks, dependencies, links_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    body.title,
    body.summary ?? null,
    status,
    0,
    null,
    body.risks ?? null,
    body.dependencies ?? null,
    linksJson,
    now,
    now
  );
  const steps: FeatureStep[] = [];
  const inputs = body.steps ?? [];
  inputs.forEach((s, i) => {
    const sid = s.id ?? nanoid(10);
    const ord = s.ordinal ?? i;
    const st: StepStatus = "pending";
    db.prepare(
      `INSERT INTO feature_steps (id, feature_id, ordinal, title, summary, status, meta_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(sid, id, ord, s.title, s.summary ?? null, st, null, now, now);
    steps.push({
      id: sid,
      featureId: id,
      ordinal: ord,
      title: s.title,
      summary: s.summary,
      status: st,
      createdAt: now,
      updatedAt: now,
    });
  });
  const run = getFeature(db, id)!;
  return { run, steps };
}

export function patchFeature(
  db: Database.Database,
  id: string,
  patch: PatchFeatureBody
): FeatureRun | undefined {
  const existing = getFeature(db, id);
  if (!existing) return undefined;
  const now = new Date().toISOString();
  const next: FeatureRun = {
    ...existing,
    title: patch.title ?? existing.title,
    summary: patch.summary !== undefined ? patch.summary : existing.summary,
    status: patch.status ?? existing.status,
    risks: patch.risks !== undefined ? patch.risks : existing.risks,
    dependencies:
      patch.dependencies !== undefined ? patch.dependencies : existing.dependencies,
    linksJson:
      patch.links !== undefined
        ? JSON.stringify(patch.links)
        : existing.linksJson,
    updatedAt: now,
  };
  db.prepare(
    `UPDATE feature_runs SET title = ?, summary = ?, status = ?, risks = ?, dependencies = ?, links_json = ?, updated_at = ? WHERE id = ?`
  ).run(
    next.title,
    next.summary ?? null,
    next.status,
    next.risks ?? null,
    next.dependencies ?? null,
    next.linksJson ?? null,
    now,
    id
  );
  return getFeature(db, id);
}

/** Shallow-merge keys into `links_json` without replacing the whole object. */
export function mergeFeatureLinks(
  db: Database.Database,
  id: string,
  partial: Record<string, unknown>
): FeatureRun | undefined {
  const existing = getFeature(db, id);
  if (!existing) return undefined;
  const now = new Date().toISOString();
  const cur: Record<string, unknown> = existing.linksJson
    ? (JSON.parse(existing.linksJson) as Record<string, unknown>)
    : {};
  const next = { ...cur, ...partial };
  db.prepare(`UPDATE feature_runs SET links_json = ?, updated_at = ? WHERE id = ?`).run(
    JSON.stringify(next),
    now,
    id
  );
  return getFeature(db, id);
}

export function startFeature(db: Database.Database, id: string): FeatureRun | undefined {
  const existing = getFeature(db, id);
  if (!existing) return undefined;
  if (!canStartFeature(existing.status)) return undefined;
  const now = new Date().toISOString();
  db.prepare(`UPDATE feature_runs SET status = ?, updated_at = ? WHERE id = ?`).run(
    "executing",
    now,
    id
  );
  const first = db
    .prepare(
      `SELECT id FROM feature_steps WHERE feature_id = ? ORDER BY ordinal ASC LIMIT 1`
    )
    .get(id) as { id: string } | undefined;
  if (first) {
    db.prepare(
      `UPDATE feature_steps SET status = 'active', updated_at = ? WHERE id = ? AND status = 'pending'`
    ).run(now, first.id);
  }
  return getFeature(db, id);
}

export function cancelFeature(db: Database.Database, id: string): FeatureRun | undefined {
  const existing = getFeature(db, id);
  if (!existing) return undefined;
  if (!canCancelFeature(existing.status)) return undefined;
  const now = new Date().toISOString();
  db.prepare(`UPDATE feature_runs SET status = 'cancelled', updated_at = ? WHERE id = ?`).run(
    now,
    id
  );
  return getFeature(db, id);
}

export function listSteps(db: Database.Database, featureId: string): FeatureStep[] {
  const rows = db
    .prepare(
      `SELECT id, feature_id, ordinal, title, summary, status, meta_json, created_at, updated_at
       FROM feature_steps WHERE feature_id = ? ORDER BY ordinal ASC`
    )
    .all(featureId) as Record<string, unknown>[];
  return rows.map(rowToStep);
}

export function replaceSteps(
  db: Database.Database,
  featureId: string,
  inputs: CreateFeatureBody["steps"]
): FeatureStep[] {
  const now = new Date().toISOString();
  db.prepare(`DELETE FROM feature_steps WHERE feature_id = ?`).run(featureId);
  const steps: FeatureStep[] = [];
  (inputs ?? []).forEach((s, i) => {
    const sid = s.id ?? nanoid(10);
    const ord = s.ordinal ?? i;
    db.prepare(
      `INSERT INTO feature_steps (id, feature_id, ordinal, title, summary, status, meta_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)`
    ).run(sid, featureId, ord, s.title, s.summary ?? null, null, now, now);
    steps.push({
      id: sid,
      featureId,
      ordinal: ord,
      title: s.title,
      summary: s.summary,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });
  });
  db.prepare(`UPDATE feature_runs SET updated_at = ? WHERE id = ?`).run(now, featureId);
  return steps;
}

export function patchStep(
  db: Database.Database,
  featureId: string,
  stepId: string,
  patch: PatchStepBody
): FeatureStep | undefined {
  const row = db
    .prepare(
      `SELECT id, feature_id, ordinal, title, summary, status, meta_json, created_at, updated_at FROM feature_steps WHERE id = ? AND feature_id = ?`
    )
    .get(stepId, featureId) as Record<string, unknown> | undefined;
  if (!row) return undefined;
  const existing = rowToStep(row);
  const now = new Date().toISOString();
  const next: FeatureStep = {
    ...existing,
    status: patch.status ?? existing.status,
    title: patch.title ?? existing.title,
    summary: patch.summary !== undefined ? patch.summary : existing.summary,
    metaJson:
      patch.meta !== undefined
        ? JSON.stringify(patch.meta)
        : existing.metaJson,
    updatedAt: now,
  };
  db.prepare(
    `UPDATE feature_steps SET title = ?, summary = ?, status = ?, meta_json = ?, updated_at = ? WHERE id = ?`
  ).run(
    next.title,
    next.summary ?? null,
    next.status,
    next.metaJson ?? null,
    now,
    stepId
  );
  db.prepare(`UPDATE feature_runs SET updated_at = ? WHERE id = ?`).run(now, featureId);
  const out = db
    .prepare(
      `SELECT id, feature_id, ordinal, title, summary, status, meta_json, created_at, updated_at FROM feature_steps WHERE id = ?`
    )
    .get(stepId) as Record<string, unknown>;
  return rowToStep(out);
}

export function appendActivity(
  db: Database.Database,
  featureId: string,
  body: AppendActivityBody
): ActivityEvent | undefined {
  if (!getFeature(db, featureId)) return undefined;
  const now = new Date().toISOString();
  const id = nanoid(12);
  const detailsJson = body.details ? JSON.stringify(body.details) : null;
  db.prepare(
    `INSERT INTO activity_events (id, feature_id, step_id, kind, message, details_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    featureId,
    body.stepId ?? null,
    body.kind,
    body.message,
    detailsJson,
    now
  );
  db.prepare(`UPDATE feature_runs SET updated_at = ? WHERE id = ?`).run(now, featureId);
  const row = db
    .prepare(
      `SELECT id, feature_id, step_id, kind, message, details_json, created_at FROM activity_events WHERE id = ?`
    )
    .get(id) as Record<string, unknown>;
  return rowToActivity(row);
}

export function listActivity(
  db: Database.Database,
  featureId: string,
  opts?: { limit?: number; sinceCreatedAt?: string }
): ActivityEvent[] {
  const limit = Math.min(Math.max(opts?.limit ?? 200, 1), 500);
  const since = opts?.sinceCreatedAt;
  const rows = since
    ? (db
        .prepare(
          `SELECT id, feature_id, step_id, kind, message, details_json, created_at FROM activity_events
           WHERE feature_id = ? AND created_at > ? ORDER BY created_at ASC LIMIT ?`
        )
        .all(featureId, since, limit) as Record<string, unknown>[])
    : (db
        .prepare(
          `SELECT id, feature_id, step_id, kind, message, details_json, created_at FROM activity_events
           WHERE feature_id = ? ORDER BY created_at DESC LIMIT ?`
        )
        .all(featureId, limit) as Record<string, unknown>[]);
  const events = rows.map(rowToActivity);
  return since ? events : events.reverse();
}

export function getFeatureTasks(
  db: Database.Database,
  featureId: string
): FeatureTaskRecord[] {
  const rows = db
    .prepare(
      `SELECT id, feature_id, ordinal, title, summary, depends_on, status, agent_id, branch, created_at, updated_at
       FROM feature_tasks WHERE feature_id = ? ORDER BY ordinal ASC`
    )
    .all(featureId) as Record<string, unknown>[];
  return rows.map(rowToFeatureTask);
}

export function upsertFeatureTask(
  db: Database.Database,
  task: FeatureTaskRecord
): FeatureTaskRecord {
  const now = new Date().toISOString();
  const createdAt = task.createdAt ?? now;
  const updatedAt = task.updatedAt ?? now;
  db.prepare(
    `INSERT INTO feature_tasks (id, feature_id, ordinal, title, summary, depends_on, status, agent_id, branch, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       feature_id = excluded.feature_id,
       ordinal = excluded.ordinal,
       title = excluded.title,
       summary = excluded.summary,
       depends_on = excluded.depends_on,
       status = excluded.status,
       agent_id = excluded.agent_id,
       branch = excluded.branch,
       updated_at = excluded.updated_at`
  ).run(
    task.id,
    task.featureId,
    task.ordinal,
    task.title,
    task.summary ?? null,
    task.dependsOn ?? "[]",
    task.status ?? "pending",
    task.agentId ?? null,
    task.branch ?? null,
    createdAt,
    updatedAt
  );
  const row = db
    .prepare(
      `SELECT id, feature_id, ordinal, title, summary, depends_on, status, agent_id, branch, created_at, updated_at
       FROM feature_tasks WHERE id = ?`
    )
    .get(task.id) as Record<string, unknown>;
  return rowToFeatureTask(row);
}
