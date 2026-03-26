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
import { readdirSync, statSync, readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import {
  getFeatureTasks,
  upsertFeatureTask,
  appendActivity,
  patchFeature,
  mergeFeatureLinks,
  listSteps,
  getFeature,
  type FeatureTaskRecord,
} from "./db-features.js";
import {
  launchCloudAgent,
  scheduleCursorAgentStatusPoll,
  type FeatureStepBrief,
} from "./cursor-cloud-agent.js";
import { emitOrchestratorEvent } from "./event-bus.js";
import type { OrchestratorYamlConfig } from "./config.js";
import type { FeatureRun } from "@orch-os/core";
import {
  COMPLETION_TRUTH_CONTRACT_VERSION,
  buildTaskCompletionTruth,
  evaluateFeatureDoneGate,
  isTaskTerminalStatus,
  type NonIntegratedCompletionReason,
  type TaskCompletionTruth,
} from "./completion-truth.js";

type TaskIntegrationOutcome = {
  taskId: string;
  ordinal: number;
  title: string;
  required: boolean;
  status: "merged" | "failed";
  taskBranch?: string;
  integrationBranch: string;
  reason?: string;
  updatedAt: string;
};

function readTaskIntegrationOutcomes(value: unknown): Record<string, TaskIntegrationOutcome> {
  if (!value || typeof value !== "object") return {};
  const out: Record<string, TaskIntegrationOutcome> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!raw || typeof raw !== "object") continue;
    const obj = raw as Record<string, unknown>;
    const taskId = typeof obj.taskId === "string" ? obj.taskId : key;
    const ordinal = typeof obj.ordinal === "number" ? obj.ordinal : -1;
    const title = typeof obj.title === "string" ? obj.title : "";
    const required = obj.required !== false;
    const status = obj.status === "merged" ? "merged" : obj.status === "failed" ? "failed" : undefined;
    const integrationBranch = typeof obj.integrationBranch === "string" ? obj.integrationBranch : "";
    if (!status || !integrationBranch) continue;
    out[key] = {
      taskId,
      ordinal,
      title,
      required,
      status,
      integrationBranch,
      taskBranch: typeof obj.taskBranch === "string" ? obj.taskBranch : undefined,
      reason: typeof obj.reason === "string" ? obj.reason : undefined,
      updatedAt: typeof obj.updatedAt === "string" ? obj.updatedAt : new Date().toISOString(),
    };
  }
  return out;
}

function evaluateRequiredIntegrations(
  tasks: FeatureTaskRecord[],
  outcomes: Record<string, TaskIntegrationOutcome>
): { ok: true } | { ok: false; issues: string[] } {
  const issues: string[] = [];
  for (const t of tasks) {
    if (t.status !== "done") continue;
    const outcome = outcomes[t.id];
    if (!outcome || outcome.required === false) {
      issues.push(`task [${t.ordinal}] "${t.title}" is done but missing required integration evidence`);
      continue;
    }
    if (outcome.status !== "merged") {
      const reason = outcome.reason ? ` (${outcome.reason})` : "";
      issues.push(`task [${t.ordinal}] "${t.title}" integration ${outcome.status}${reason}`);
    }
  }
  if (issues.length > 0) return { ok: false, issues };
  return { ok: true };
}

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

/** Seed feature_tasks from feature steps if not already seeded.
 *  By default tasks are sequential: task N depends on N-1.
 *  This ensures each agent sees all prior tasks' committed work. */
export function seedTasksFromSteps(
  db: Database.Database,
  featureId: string,
  steps: FeatureStepBrief[]
): FeatureTaskRecord[] {
  const existing = getFeatureTasks(db, featureId);
  if (existing.length > 0) return existing;

  const now = new Date().toISOString();
  // Pre-generate all IDs so sequential deps can reference the previous task
  const ids = steps.map(() => nanoid(10));
  const tasks: FeatureTaskRecord[] = steps.map((s, idx) => ({
    id: ids[idx],
    featureId,
    ordinal: s.ordinal,
    title: s.title,
    summary: s.summary,
    // Task 0 has no deps; task N depends on task N-1 (sequential by default)
    dependsOn: idx === 0 ? "[]" : JSON.stringify([ids[idx - 1]]),
    status: "pending",
    integrationResult: "pending",
    integrationReason: "waiting_for_cloud_completion",
    integrationRecordedAt: now,
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
  fileContentContext?: string;
  activityBaseUrl?: string;
  /** The exact branch name passed to the Cursor API — agent must push to this. */
  taskBranch: string;
}): string {
  const { task, allTasks, featureId } = opts;
  const otherTasks = allTasks.filter((t) => t.id !== task.id);

  const lines = [
    `# Task: ${task.title}`,
    ``,
    `You are an L2 coding agent for Orchestration OS feature \`${featureId}\`.`,
    `**RULE: You MUST make at least one git commit and push before finishing.**`,
    `**Even a partial implementation is better than nothing — commit what you have, even if incomplete.**`,
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

  // Inject actual file content for files the task references — this is the most important context
  if (opts.fileContentContext) {
    lines.push(``, `## Current content of files you need to edit`, opts.fileContentContext);
  } else if (opts.repoContext) {
    lines.push(``, `## Existing files`, "```", opts.repoContext, "```");
  }

  if (otherTasks.length > 0) {
    lines.push(
      ``,
      `## Other tasks handled by parallel agents (do NOT touch their files)`,
      ...otherTasks.map((t) => `- ${t.title}`)
    );
  }

  lines.push(
    ``,
    `## How to finish`,
    `1. Read the file contents above carefully.`,
    `2. Make the minimal targeted edits needed for this task.`,
    `3. \`git add -A && git commit -m "feat: <what you did>"\` — commit after each file you change.`,
    `4. \`git push -u origin HEAD\` — push when done.`,
    `5. You are already on branch \`${opts.taskBranch}\` — do NOT switch branches. Just commit and push.`,
    ``,
    `**If you are unsure about anything, commit your best attempt anyway. A partial commit is required.**`,
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

/**
 * Extract file paths that look like repo paths from free text
 * (e.g. "In packages/ui/src/FeaturesPanel.tsx, add..." → ["packages/ui/src/FeaturesPanel.tsx"])
 */
function extractMentionedFiles(text: string): string[] {
  const matches = text.match(/\b(packages\/[\w/-]+\.\w+|src\/[\w/-]+\.\w+|[\w/-]+\.(ts|tsx|css|json|mjs|mts))\b/g);
  if (!matches) return [];
  // deduplicate and filter out obviously wrong matches
  return [...new Set(matches)].filter(
    (p) => !p.startsWith("node_modules") && p.includes("/")
  );
}

/**
 * For each file mentioned in the task text, read its content from cwd.
 * Returns a formatted string of filename + content snippets to inject into the prompt.
 * Caps each file at MAX_FILE_LINES lines so the prompt doesn't explode.
 */
function buildFileContentContext(cwd: string, taskText: string, maxLinesPerFile = 600): string {
  const mentioned = extractMentionedFiles(taskText);
  const snippets: string[] = [];

  for (const relPath of mentioned) {
    const abs = join(cwd, relPath);
    if (!existsSync(abs)) continue;
    try {
      const raw = readFileSync(abs, "utf8");
      const lines = raw.split("\n");
      const truncated = lines.length > maxLinesPerFile;
      const content = truncated
        ? lines.slice(0, maxLinesPerFile).join("\n") + `\n… (${lines.length - maxLinesPerFile} more lines)`
        : raw;
      snippets.push(`### ${relPath}\n\`\`\`\n${content}\n\`\`\``);
    } catch {
      /* skip unreadable */
    }
  }

  return snippets.join("\n\n");
}

/**
 * Merge a completed task's branch into a per-feature integration branch.
 * Each subsequent task uses this integration branch as ref so it sees all
 * prior tasks' committed work.
 *
 * Returns merge outcome details for persistence and UI/API inspection.
 */
type IntegrationMergeOutcome =
  | { integrated: true; integrationBranch: string; detail: string }
  | { integrated: false; reason: NonIntegratedCompletionReason; detail: string };

function mergeTaskBranchToIntegration(opts: {
  cwd: string;
  taskBranch: string;
  integrationBranch: string;
  baseRef: string; // "main" or another base — used to create the branch the first time
}): IntegrationMergeOutcome {
  const { cwd, taskBranch, integrationBranch, baseRef } = opts;
  const run = (cmd: string) =>
    execSync(cmd, { cwd, stdio: ["ignore", "pipe", "pipe"] }).toString().trim();
  const restoreCheckout = () => {
    try {
      run(`git checkout -`);
    } catch {
      /* ignore */
    }
  };

  if (!taskBranch.trim()) {
    return { integrated: false, reason: "missing_task_branch", detail: "Task branch was empty." };
  }

  try {
    run(`git fetch origin ${taskBranch}`);
  } catch {
    return {
      integrated: false,
      reason: "missing_task_branch",
      detail: `Unable to fetch origin/${taskBranch}.`,
    };
  }

  try {
    try {
      run(`git fetch origin ${integrationBranch}`);
      run(`git checkout -B ${integrationBranch} origin/${integrationBranch}`);
    } catch {
      // Integration branch doesn't exist yet — create from baseRef
      run(`git fetch origin ${baseRef}`);
      run(`git checkout -B ${integrationBranch} origin/${baseRef}`);
    }
  } catch {
    restoreCheckout();
    return {
      integrated: false,
      reason: "integration_branch_unavailable",
      detail: `Unable to check out integration branch ${integrationBranch} from ${baseRef}.`,
    };
  }

  try {
    // Merge the task branch (prefer theirs on conflict to avoid blocking the pipeline)
    run(`git merge --no-edit -X theirs origin/${taskBranch}`);
    // Push the integration branch
    run(`git push origin ${integrationBranch}`);
    restoreCheckout();
    return {
      integrated: true,
      integrationBranch,
      detail: `Merged origin/${taskBranch} into ${integrationBranch}.`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[task-engine] merge integration failed: ${msg.slice(0, 200)}`);
    restoreCheckout();
    return {
      integrated: false,
      reason: "merge_failed",
      detail: msg.slice(0, 1000),
    };
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
  return tasks.every((t) => isTaskTerminalStatus(t.status));
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
  const taskIntegrationOutcomes = readTaskIntegrationOutcomes(links.taskIntegrationOutcomes);
  const targetPath = links.targetPath as string | undefined;
  const repoContext = buildRepoContext(cwd, targetPath);
  const activityBaseUrl = process.env.ORCHESTRATOR_ACTIVITY_BASE_URL;
  const integrationBranch = `${branchNamePrefix}-int-${fid.slice(0, 12)}`;
  // currentRef is updated to the integration branch after the first task merges
  let currentRef = ref;

  function log(message: string, kind: "plan" | "tool" | "agent" | "note" | "error" | "merge" = "note") {
    const ev = appendActivity(db, fid, { kind, message: message.slice(0, 4000) });
    if (ev) emitActivity(fid, ev);
    emitOrchestratorEvent({ type: "feature_updated", featureId: fid });
  }

  function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  function getFeatureLinksSnapshot(): Record<string, unknown> {
    const current = getFeature(db, fid);
    if (!current?.linksJson) return {};
    try {
      const parsed = JSON.parse(current.linksJson) as unknown;
      return isRecord(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  function getTaskCompletionTruthById(): Record<string, TaskCompletionTruth | undefined> {
    const linksSnapshot = getFeatureLinksSnapshot();
    const raw = linksSnapshot.taskCompletionTruthById;
    if (!isRecord(raw)) return {};
    const out: Record<string, TaskCompletionTruth | undefined> = {};
    for (const [taskId, truth] of Object.entries(raw)) {
      if (isRecord(truth)) {
        out[taskId] = truth as TaskCompletionTruth;
      }
    }
    return out;
  }

  function upsertTaskCompletionTruth(truth: TaskCompletionTruth): void {
    const cur = getTaskCompletionTruthById();
    mergeFeatureLinks(db, fid, {
      completionTruthContractVersion: COMPLETION_TRUTH_CONTRACT_VERSION,
      taskCompletionTruthById: {
        ...cur,
        [truth.taskId]: truth,
      },
    });
  }

  function saveTaskIntegrationOutcome(task: FeatureTaskRecord, outcome: TaskIntegrationOutcome): void {
    taskIntegrationOutcomes[task.id] = outcome;
    mergeFeatureLinks(db, fid, { taskIntegrationOutcomes });
  }

  function failFeatureForIntegrationGate(issues: string[]): void {
    mergeFeatureLinks(db, fid, {
      taskEngineStatus: "failed",
      requiredTaskIntegrationsGate: "failed",
      requiredTaskIntegrationIssues: issues,
      taskIntegrationOutcomes,
    });
    patchFeature(db, fid, { status: "failed" });
    emitOrchestratorEvent({ type: "feature_updated", featureId: fid });
  }

  function dispatchTask(task: FeatureTaskRecord, allTasks: FeatureTaskRecord[], taskRef: string): void {
    const taskBranch = `${branchNamePrefix}-task-${fid.slice(0, 8)}-${task.id}`;
    // Build file content context from files mentioned in the task title + summary
    const taskText = [task.title, task.summary ?? ""].join(" ");
    const fileContentContext = buildFileContentContext(cwd, taskText) || undefined;
    const promptText = buildTaskPrompt({
      featureId: fid,
      featureTitle: feature.title,
      featureSummary: feature.summary,
      task,
      allTasks,
      links,
      repoContext: fileContentContext ? undefined : repoContext,
      fileContentContext,
      activityBaseUrl,
      taskBranch,
    });

    void (async () => {
      try {
        const launched = await launchCloudAgent({
          apiKey,
          repository,
          ref: taskRef,
          model,
          branchName: taskBranch,
          promptText,
        });

        upsertFeatureTask(db, {
          ...task,
          status: "active",
          agentId: launched.id,
          branch: launched.branchName ?? taskBranch,
          integrationResult: "pending",
          integrationReason: "waiting_for_cloud_completion",
          integrationDetail: "Cloud agent launched; waiting for terminal status.",
          integrationRecordedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });

        log(
          `L2 agent launched for task [${task.ordinal}] "${task.title}" — ${launched.targetUrl} (branch: ${taskBranch}, ref: ${taskRef})`,
          "agent"
        );

        scheduleCursorAgentStatusPoll({
          featureId: `${fid}::task::${task.id}`,
          agentId: launched.id,
          apiKey,
          intervalMs: pollIntervalMs,
          onUpdate: () => {
            // Only update the agent's external status — don't overwrite task.status
            upsertFeatureTask(db, {
              ...(getFeatureTasks(db, fid).find((t) => t.id === task.id) ?? task),
              agentId: launched.id,
              branch: launched.branchName ?? taskBranch,
              updatedAt: new Date().toISOString(),
            });
            emitOrchestratorEvent({ type: "feature_updated", featureId: fid });
          },
          onTerminal: (status, summary) => {
            const taskStatus = status === "FINISHED" ? "done" : "failed";
            const latestTask = getFeatureTasks(db, fid).find((t) => t.id === task.id) ?? task;
            const completedBranch = launched.branchName ?? taskBranch;
            const terminalAt = new Date().toISOString();
            upsertFeatureTask(db, {
              ...latestTask,
              status: taskStatus,
              agentId: launched.id,
              branch: completedBranch,
              integrationResult: taskStatus === "done" ? "cloud_completed" : "not_applicable",
              integrationReason: taskStatus === "done" ? "cloud_agent_finished" : "cloud_agent_failed",
              integrationDetail: summary
                ? summary.slice(0, 1000)
                : taskStatus === "done"
                  ? "Cloud agent reported FINISHED."
                  : "Cloud agent ended without FINISHED status.",
              integrationRecordedAt: terminalAt,
              updatedAt: terminalAt,
            });

            log(
              `L2 task [${task.ordinal}] "${task.title}" ${taskStatus === "done" ? "completed" : "FAILED"}.${summary ? ` ${summary}` : ""}`,
              taskStatus === "done" ? "tool" : "error"
            );

            // Merge completed task branch into integration branch so subsequent tasks see this work
            if (taskStatus === "done") {
              const mergeOutcome = mergeTaskBranchToIntegration({
                cwd,
                taskBranch: completedBranch,
                integrationBranch,
                baseRef: ref,
              });
              if (mergeOutcome.integrated) {
                saveTaskIntegrationOutcome(latestTask, {
                  taskId: latestTask.id,
                  ordinal: latestTask.ordinal,
                  title: latestTask.title,
                  required: true,
                  status: "merged",
                  taskBranch: completedBranch,
                  integrationBranch,
                  updatedAt: new Date().toISOString(),
                });
                currentRef = integrationBranch;
                const afterMerge = getFeatureTasks(db, fid).find((t) => t.id === task.id) ?? latestTask;
                upsertFeatureTask(db, {
                  ...afterMerge,
                  integrationResult: "integrated_completed",
                  integrationReason: "merged_into_integration_branch",
                  integrationDetail: mergeOutcome.detail,
                  integrationRecordedAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                });
                log(`Merged task [${task.ordinal}] into integration branch ${integrationBranch}`, "merge");
                upsertTaskCompletionTruth(
                  buildTaskCompletionTruth({
                    taskId: task.id,
                    taskStatus,
                    integrationResult: "integrated",
                    integratedBranch: mergeOutcome.integrationBranch,
                  })
                );
              } else {
                const afterMerge = getFeatureTasks(db, fid).find((t) => t.id === task.id) ?? latestTask;
                upsertFeatureTask(db, {
                  ...afterMerge,
                  integrationResult: "integration_failed",
                  integrationReason: "integration_merge_failed",
                  integrationDetail: mergeOutcome.detail,
                  integrationRecordedAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                });
                upsertTaskCompletionTruth(
                  buildTaskCompletionTruth({
                    taskId: task.id,
                    taskStatus,
                    integrationResult: "not_integrated",
                    nonIntegratedReason: mergeOutcome.reason,
                  })
                );
                log(
                  `Task [${task.ordinal}] completed but not integrated (reason: ${mergeOutcome.reason}).`,
                  "error"
                );
                saveTaskIntegrationOutcome(latestTask, {
                  taskId: latestTask.id,
                  ordinal: latestTask.ordinal,
                  title: latestTask.title,
                  required: true,
                  status: "failed",
                  taskBranch: completedBranch,
                  integrationBranch,
                  reason: mergeOutcome.reason,
                  updatedAt: new Date().toISOString(),
                });
              }
            } else {
              upsertTaskCompletionTruth(
                buildTaskCompletionTruth({
                  taskId: task.id,
                  taskStatus,
                  integrationResult: "not_applicable",
                })
              );
            }

            // Continue the dispatch loop
            onTaskTerminal();
          },
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const now = new Date().toISOString();
        upsertFeatureTask(db, {
          ...task,
          status: "failed",
          integrationResult: "not_applicable",
          integrationReason: "agent_launch_failed",
          integrationDetail: msg.slice(0, 1000),
          integrationRecordedAt: now,
          updatedAt: now,
        });
        log(`L2 agent launch failed for task "${task.title}": ${msg.slice(0, 500)}`, "error");
        onTaskTerminal();
      }
    })();
  }

  function onTaskTerminal(): void {
    const tasks = getFeatureTasks(db, fid);

    if (!allTerminal(tasks)) {
      // Dispatch any newly unblocked tasks using the latest integration ref
      const ready = getReadyTasks(tasks);
      if (ready.length > 0) {
        log(`${ready.length} task(s) now unblocked — dispatching L2 agent(s) using ref: ${currentRef}…`, "plan");
        for (const t of ready) dispatchTask(t, tasks, currentRef);
      }
      return;
    }

    // Evaluate the explicit done gate before launching merge auditor.
    const preAuditGate = evaluateFeatureDoneGate({
      tasks,
      taskTruthById: getTaskCompletionTruthById(),
      requireMergeAuditorSuccess: false,
    });
    mergeFeatureLinks(db, fid, {
      completionTruthContractVersion: COMPLETION_TRUTH_CONTRACT_VERSION,
      featureDoneGateTruth: preAuditGate,
    });

    if (!preAuditGate.done) {
      log(
        `Feature done gate failed before auditor: ${preAuditGate.failureReasons.join(", ")}.`,
        "error"
      );
      mergeFeatureLinks(db, fid, { taskEngineStatus: "failed" });
      patchFeature(db, fid, { status: "failed" });
      emitOrchestratorEvent({ type: "feature_updated", featureId: fid });
      return;
    }

    const integrationGate = evaluateRequiredIntegrations(tasks, taskIntegrationOutcomes);
    if (!integrationGate.ok) {
      log(
        `Required task integration gate failed. Feature cannot be marked completed. ${integrationGate.issues.join("; ")}`,
        "error"
      );
      failFeatureForIntegrationGate(integrationGate.issues);
      return;
    }

    log("All L2 tasks completed. Launching merge auditor…", "plan");
    mergeFeatureLinks(db, fid, {
      taskEngineStatus: "auditing",
      requiredTaskIntegrationsGate: "passed",
      taskIntegrationOutcomes,
    });

    // Auditor gets the integration branch (which has all tasks merged into it)
    const auditorRef = currentRef;
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
          ref: auditorRef,
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
            const finalGate = evaluateFeatureDoneGate({
              tasks: getFeatureTasks(db, fid),
              taskTruthById: getTaskCompletionTruthById(),
              requireMergeAuditorSuccess: true,
              mergeAuditorStatus: status,
            });
            const latestTasks = getFeatureTasks(db, fid);
            const integrationGate = evaluateRequiredIntegrations(latestTasks, taskIntegrationOutcomes);
            if (finalGate.done && !integrationGate.ok) {
              failFeatureForIntegrationGate(integrationGate.issues);
              mergeFeatureLinks(db, fid, { mergeAuditorStatus: status });
              log(
                `Merge auditor completed but required task integrations gate failed. ${integrationGate.issues.join("; ")}`,
                "error"
              );
              return;
            }
            const featureStatus = finalGate.done ? "completed" : "failed";
            mergeFeatureLinks(db, fid, {
              taskEngineStatus: featureStatus,
              mergeAuditorStatus: status,
              completionTruthContractVersion: COMPLETION_TRUTH_CONTRACT_VERSION,
              featureDoneGateTruth: finalGate,
              requiredTaskIntegrationsGate: featureStatus === "completed" ? "passed" : "failed",
              taskIntegrationOutcomes,
            });
            patchFeature(db, fid, { status: featureStatus });
            log(
              finalGate.done
                ? `Merge auditor completed — feature ${featureStatus}.${summary ? ` ${summary}` : ""}`
                : `Merge auditor terminal status ${status} but done gate failed (${finalGate.failureReasons.join(", ")}). Feature ${featureStatus}.${summary ? ` ${summary}` : ""}`,
              finalGate.done ? "merge" : "error"
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
  for (const t of ready) dispatchTask(t, tasks, currentRef);
}
