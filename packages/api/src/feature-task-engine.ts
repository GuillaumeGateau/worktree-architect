/**
 * Feature Task Engine — parallel L2 dispatch with dependency graph.
 *
 * Lifecycle:
 *   startTaskEngine(featureId)
 *     → seedTasksFromSteps (if not already seeded)
 *     → dispatchReadyTasks (tasks with no pending deps)
 *       → for each: launchCloudAgent → schedulePoll
 *         → onTerminal: markTaskDone → dispatchReadyTasks (loop)
 *     → when all tasks terminal: launchMergeAuditor → feature completed/failed
 */

import { nanoid } from "nanoid";
import type Database from "better-sqlite3";
import { join } from "node:path";
import { readdirSync, statSync } from "node:fs";
import {
  getFeatureTasks,
  upsertFeatureTask,
  appendActivity,
  patchFeature,
  mergeFeatureLinks,
  listSteps,
  type FeatureTaskRecord,
} from "./db-features.js";
import {
  launchCloudAgent,
  scheduleCursorAgentStatusPoll,
  type FeatureStepBrief,
} from "./cursor-cloud-agent.js";
import { emitOrchestratorEvent, bus } from "./event-bus.js";
import type { OrchestratorYamlConfig } from "./config.js";
import type { FeatureRun } from "@orch-os/core";

export type TaskEngineOptions = {
  db: Database.Database;
  feature: FeatureRun;
  yamlConfig: OrchestratorYamlConfig;
  apiKey: string;
  repository: string;
  ref: string;
  branchNamePrefix: string;
  model?: string;
  pollIntervalMs: number;
  cwd: string;
  emitActivity: (featureId: string, ev: ReturnType<typeof appendActivity>) => void;
};

/** Seed feature_tasks from feature steps if not already seeded. */
export function seedTasksFromSteps(
  db: Database.Database,
  featureId: string,
  steps: FeatureStepBrief[]
): FeatureTaskRecord[] {
  const existing = getFeatureTasks(db, featureId);
  if (existing.length > 0) return existing;

  const now = new Date().toISOString();
  const tasks: FeatureTaskRecord[] = steps.map((s) => ({
    id: nanoid(10),
    featureId,
    ordinal: s.ordinal,
    title: s.title,
    summary: s.summary,
    dependsOn: "[]",
    status: "pending",
    createdAt: now,
    updatedAt: now,
  }));

  for (const t of tasks) upsertFeatureTask(db, t);
  return tasks;
}

function buildTaskPrompt(opts: {
  featureId: string;
  featureTitle: string;
  featureSummary?: string;
  task: FeatureTaskRecord;
  allTasks: FeatureTaskRecord[];
  links?: Record<string, unknown>;
  repoContext?: string;
  activityBaseUrl?: string;
}): string {
  const { task, allTasks, featureId } = opts;
  const otherTasks = allTasks.filter((t) => t.id !== task.id);
  const branch = `orch-task-${featureId.slice(0, 8)}-${task.id}`;

  const lines = [
    `# Task: ${task.title}`,
    ``,
    `You are an L2 coding agent for Orchestration OS feature \`${featureId}\`.`,
    `**RULE: You MUST make at least one git commit and push before finishing. No commit = failed run.**`,
    ``,
    `## Your specific task`,
    task.title,
  ];
  if (task.summary) lines.push(``, task.summary);

  lines.push(
    ``,
    `## Feature context`,
    `Feature: ${opts.featureTitle}`,
  );
  if (opts.featureSummary) lines.push(opts.featureSummary);

  if (opts.links?.targetPath) {
    lines.push(``, `## Target directory: \`${opts.links.targetPath}\``);
    lines.push(`Edit files inside \`${opts.links.targetPath as string}\`. Do not touch other tasks' files.`);
  }

  if (opts.repoContext) {
    lines.push(``, `## Existing files`, "```", opts.repoContext, "```");
  }

  if (otherTasks.length > 0) {
    lines.push(
      ``,
      `## Other tasks in this feature (parallel agents handle these — do NOT touch their files)`,
      ...otherTasks.map((t) => `- ${t.title}`)
    );
  }

  lines.push(
    ``,
    `## How to finish`,
    `1. Implement the task. Make targeted edits.`,
    `2. \`git add -A && git commit -m "feat: <what you did>"\` — commit after each file.`,
    `3. \`git push -u origin HEAD\` — push when done.`,
    `4. Branch: \`${branch}\``,
  );

  if (opts.activityBaseUrl) {
    lines.push(
      ``,
      `## Optional: report progress`,
      `curl -s -X POST -H 'content-type: application/json' \\`,
      `  -d '{"kind":"agent","message":"…"}' \\`,
      `  "${opts.activityBaseUrl}/api/v1/features/${featureId}/activity"`,
    );
  }

  return lines.join("\n");
}

function buildRepoContext(cwd: string, targetPath?: string): string | undefined {
  try {
    const scanRoot = targetPath ? join(cwd, targetPath) : cwd;
    const collectFiles = (dir: string, depth = 0): string[] => {
      if (depth > 2) return [];
      const entries = readdirSync(dir, { withFileTypes: true });
      const out: string[] = [];
      for (const e of entries) {
        if (e.name.startsWith(".") || e.name === "node_modules" || e.name === "dist") continue;
        const rel = join(dir, e.name).replace(cwd + "/", "");
        if (e.isDirectory()) {
          out.push(...collectFiles(join(dir, e.name), depth + 1));
        } else if (e.isFile()) {
          const sz = statSync(join(dir, e.name)).size;
          out.push(`${rel} (${Math.round(sz / 1024)}kB)`);
        }
      }
      return out;
    };
    const files = collectFiles(scanRoot);
    return files.length > 0 ? files.join("\n") : undefined;
  } catch {
    return undefined;
  }
}

function getReadyTasks(tasks: FeatureTaskRecord[]): FeatureTaskRecord[] {
  const doneIds = new Set(
    tasks.filter((t) => t.status === "done").map((t) => t.id)
  );
  return tasks.filter((t) => {
    if (t.status !== "pending") return false;
    const deps = JSON.parse(t.dependsOn || "[]") as string[];
    return deps.every((dep) => doneIds.has(dep));
  });
}

function allTerminal(tasks: FeatureTaskRecord[]): boolean {
  return tasks.every((t) =>
    ["done", "failed", "blocked"].includes(t.status)
  );
}

function anyFailed(tasks: FeatureTaskRecord[]): boolean {
  return tasks.some((t) => t.status === "failed");
}

function buildMergeAuditorPrompt(opts: {
  featureId: string;
  featureTitle: string;
  tasks: FeatureTaskRecord[];
  links?: Record<string, unknown>;
  activityBaseUrl?: string;
}): string {
  const branches = opts.tasks
    .filter((t) => t.branch)
    .map((t) => `- \`${t.branch}\` → ${t.title}`);

  const lines = [
    `# Merge Auditor for feature \`${opts.featureId}\``,
    ``,
    `All L2 parallel tasks have completed for: **${opts.featureTitle}**`,
    ``,
    `## Your job`,
    `1. Review the changes on each L2 branch listed below.`,
    `2. Check for conflicts between branches.`,
    `3. Merge each branch into \`main\` in dependency order (or sequentially if no conflicts).`,
    `4. Resolve any merge conflicts using best judgment — prefer additive changes.`,
    `5. Push the merged \`main\` and open a single summary PR if appropriate.`,
    `6. Write a short summary of what was merged and any issues found.`,
    ``,
    `## L2 branches to merge`,
    ...branches,
    ``,
    `## Important`,
    `- Do NOT re-implement any code — only merge what the L2 agents wrote.`,
    `- If two branches conflict on the same file, keep both changes where possible.`,
    `- Commit a merge summary message: \`chore: merge L2 branches for feature ${opts.featureId}\``,
  ];

  if (opts.activityBaseUrl) {
    lines.push(
      ``,
      `## Report result`,
      `curl -s -X POST -H 'content-type: application/json' \\`,
      `  -d '{"kind":"merge","message":"Auditor complete: <summary>"}' \\`,
      `  "${opts.activityBaseUrl}/api/v1/features/${opts.featureId}/activity"`,
    );
  }

  return lines.join("\n");
}

/**
 * Start the parallel task engine for a feature.
 * Can be called on feature Start or on server restart for in-progress features.
 */
export function startTaskEngine(opts: TaskEngineOptions): void {
  const {
    db,
    feature,
    yamlConfig,
    apiKey,
    repository,
    ref,
    branchNamePrefix,
    model,
    pollIntervalMs,
    cwd,
    emitActivity,
  } = opts;

  const fid = feature.id;
  const links = feature.linksJson
    ? (JSON.parse(feature.linksJson) as Record<string, unknown>)
    : {};
  const targetPath = links.targetPath as string | undefined;
  const repoContext = buildRepoContext(cwd, targetPath);
  const activityBaseUrl = process.env.ORCHESTRATOR_ACTIVITY_BASE_URL;

  function log(message: string, kind: "plan" | "tool" | "agent" | "note" | "error" | "merge" = "note") {
    const ev = appendActivity(db, fid, { kind, message: message.slice(0, 4000) });
    if (ev) emitActivity(fid, ev);
    emitOrchestratorEvent({ type: "feature_updated", featureId: fid });
  }

  function dispatchTask(task: FeatureTaskRecord, allTasks: FeatureTaskRecord[]): void {
    const taskBranch = `${branchNamePrefix}-task-${fid.slice(0, 8)}-${task.id}`;
    const promptText = buildTaskPrompt({
      featureId: fid,
      featureTitle: feature.title,
      featureSummary: feature.summary,
      task,
      allTasks,
      links,
      repoContext,
      activityBaseUrl,
    });

    void (async () => {
      try {
        const launched = await launchCloudAgent({
          apiKey,
          repository,
          ref,
          model,
          branchName: taskBranch,
          promptText,
        });

        upsertFeatureTask(db, {
          ...task,
          status: "active",
          agentId: launched.id,
          branch: launched.branchName ?? taskBranch,
          updatedAt: new Date().toISOString(),
        });

        log(
          `L2 agent launched for task [${task.ordinal}] "${task.title}" — ${launched.targetUrl} (branch: ${taskBranch})`,
          "agent"
        );

        scheduleCursorAgentStatusPoll({
          featureId: `${fid}::task::${task.id}`,
          agentId: launched.id,
          apiKey,
          intervalMs: pollIntervalMs,
          onUpdate: (status) => {
            upsertFeatureTask(db, {
              ...task,
              agentId: launched.id,
              branch: launched.branchName ?? taskBranch,
              updatedAt: new Date().toISOString(),
            });
            emitOrchestratorEvent({ type: "feature_updated", featureId: fid });
          },
          onTerminal: (status, summary) => {
            const taskStatus = status === "FINISHED" ? "done" : "failed";
            const latestTask = getFeatureTasks(db, fid).find((t) => t.id === task.id) ?? task;
            upsertFeatureTask(db, {
              ...latestTask,
              status: taskStatus,
              agentId: launched.id,
              branch: launched.branchName ?? taskBranch,
              updatedAt: new Date().toISOString(),
            });

            log(
              `L2 task [${task.ordinal}] "${task.title}" ${taskStatus === "done" ? "completed" : "FAILED"}.${summary ? ` ${summary}` : ""}`,
              taskStatus === "done" ? "tool" : "error"
            );

            // Continue the dispatch loop
            onTaskTerminal();
          },
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        upsertFeatureTask(db, { ...task, status: "failed", updatedAt: new Date().toISOString() });
        log(`L2 agent launch failed for task "${task.title}": ${msg.slice(0, 500)}`, "error");
        onTaskTerminal();
      }
    })();
  }

  function onTaskTerminal(): void {
    const tasks = getFeatureTasks(db, fid);

    if (!allTerminal(tasks)) {
      // Dispatch any newly unblocked tasks
      const ready = getReadyTasks(tasks);
      if (ready.length > 0) {
        log(`${ready.length} task(s) now unblocked — dispatching L2 agents…`, "plan");
        for (const t of ready) dispatchTask(t, tasks);
      }
      return;
    }

    // All tasks finished
    if (anyFailed(tasks)) {
      log("One or more L2 tasks failed. Skipping merge auditor — feature marked failed.", "error");
      mergeFeatureLinks(db, fid, { taskEngineStatus: "failed" });
      patchFeature(db, fid, { status: "failed" });
      emitOrchestratorEvent({ type: "feature_updated", featureId: fid });
      return;
    }

    log("All L2 tasks completed. Launching merge auditor…", "plan");
    mergeFeatureLinks(db, fid, { taskEngineStatus: "auditing" });

    const auditorBranch = `${branchNamePrefix}-audit-${fid}`.slice(0, 200);
    const promptText = buildMergeAuditorPrompt({
      featureId: fid,
      featureTitle: feature.title,
      tasks,
      links,
      activityBaseUrl,
    });

    void (async () => {
      try {
        const launched = await launchCloudAgent({
          apiKey,
          repository,
          ref,
          model,
          branchName: auditorBranch,
          promptText,
        });

        mergeFeatureLinks(db, fid, {
          mergeAuditorAgentId: launched.id,
          mergeAuditorAgentUrl: launched.targetUrl,
          mergeAuditorBranch: launched.branchName ?? auditorBranch,
        });

        log(`Merge auditor launched — ${launched.targetUrl}`, "merge");

        scheduleCursorAgentStatusPoll({
          featureId: `${fid}::auditor`,
          agentId: launched.id,
          apiKey,
          intervalMs: pollIntervalMs,
          onUpdate: () => {
            emitOrchestratorEvent({ type: "feature_updated", featureId: fid });
          },
          onTerminal: (status, summary) => {
            const featureStatus = status === "FINISHED" ? "completed" : "failed";
            mergeFeatureLinks(db, fid, {
              taskEngineStatus: featureStatus,
              mergeAuditorStatus: status,
            });
            patchFeature(db, fid, { status: featureStatus });
            log(
              `Merge auditor ${status === "FINISHED" ? "completed" : "FAILED"} — feature ${featureStatus}.${summary ? ` ${summary}` : ""}`,
              status === "FINISHED" ? "merge" : "error"
            );
            emitOrchestratorEvent({ type: "feature_updated", featureId: fid });
          },
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        log(`Merge auditor launch failed: ${msg.slice(0, 500)}`, "error");
        patchFeature(db, fid, { status: "failed" });
        emitOrchestratorEvent({ type: "feature_updated", featureId: fid });
      }
    })();
  }

  // Seed tasks from steps if not already seeded
  const steps = listSteps(db, fid);
  const tasks = seedTasksFromSteps(
    db,
    fid,
    steps.map((s) => ({ title: s.title, summary: s.summary, ordinal: s.ordinal }))
  );

  if (tasks.length === 0) {
    log("No steps found — nothing to dispatch.", "note");
    return;
  }

  log(
    `Task engine started: ${tasks.length} task(s) seeded. Dispatching tasks with no dependencies…`,
    "plan"
  );
  mergeFeatureLinks(db, fid, { taskEngineStatus: "dispatching", taskCount: tasks.length });

  const ready = getReadyTasks(tasks);
  if (ready.length === 0) {
    log("No tasks are ready to dispatch (check depends_on configuration).", "error");
    return;
  }

  log(
    `Dispatching ${ready.length} parallel L2 agent(s): ${ready.map((t) => `"${t.title}"`).join(", ")}`,
    "plan"
  );
  for (const t of ready) dispatchTask(t, tasks);
}
