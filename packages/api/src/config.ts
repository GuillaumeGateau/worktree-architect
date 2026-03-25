import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";

/** Optional Cursor Cloud Agents launch on Feature Start (see docs/FEATURE_EXECUTION.md). */
export type CursorCloudAgentYamlConfig = {
  enabled: boolean;
  repository: string;
  ref: string;
  apiKeyEnv: string;
  model?: string;
  branchNamePrefix: string;
  pollStatus: boolean;
  pollIntervalSeconds: number;
};

/** Git worktree + local spawn on Feature Start (see docs/FEATURE_EXECUTION.md). */
export type FeatureWorktreeYamlConfig = {
  /** Default true — set false for non-git sandboxes. */
  enabled: boolean;
  /** Directory under repo root where per-feature worktrees live. */
  root: string;
  branchPrefix: string;
  /** When true and featureStartCommand is unset, run scripts/orch-feature-start-worker.mjs */
  spawnDefaultHook: boolean;
  /** Best-effort `cursor <worktreePath>` after hook spawn. */
  openWithCursor: boolean;
};

export type OrchestratorYamlConfig = {
  maxParallelWorkers?: number;
  testCommand?: string;
  lintCommand?: string;
  sqlitePath?: string;
  statusMdPath?: string;
  /**
   * When not false (default on), Start launches a Cursor Cloud Agent if `CURSOR_API_KEY` (or apiKeyEnv)
   * is set and `git remote get-url origin` is GitHub — even when `cursorCloudAgent.enabled` is omitted.
   * Set to false to require an explicit `cursorCloudAgent` block.
   */
  autoCursorCloudAgentOnStart?: boolean;
  cursorCloudAgent?: CursorCloudAgentYamlConfig;
  featureWorktree?: FeatureWorktreeYamlConfig;
  /**
   * When not false (default on), Start seeds feature_tasks from steps and dispatches
   * one L2 Cloud Agent per task, managing a dependency-aware dispatch loop.
   * Set to false to use the legacy single-agent-per-feature mode.
   */
  taskEngine?: boolean;
  /** Shell string or argv; placeholders {{featureId}} {{cwd}} */
  featureStartCommand?: string | string[];
};

const defaultConfig: OrchestratorYamlConfig = {
  maxParallelWorkers: 8,
  sqlitePath: ".orchestrator/orchestrator.db",
  statusMdPath: ".orchestrator/STATUS.md",
  autoCursorCloudAgentOnStart: true,
};

/** Defaults used when `featureWorktree` is omitted from YAML. */
export function defaultFeatureWorktreeConfig(): FeatureWorktreeYamlConfig {
  return {
    enabled: true,
    root: ".orchestrator/feature-worktrees",
    branchPrefix: "orch-feature",
    spawnDefaultHook: true,
    openWithCursor: false,
  };
}

export function resolveFeatureWorktree(
  yaml: OrchestratorYamlConfig
): FeatureWorktreeYamlConfig {
  return yaml.featureWorktree ?? defaultFeatureWorktreeConfig();
}

export function loadOrchestratorConfig(cwd: string): OrchestratorYamlConfig {
  const candidates = [
    join(cwd, "orchestrator.config.yaml"),
    join(cwd, "orchestrator.config.yml"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) {
      const raw = readFileSync(p, "utf8");
      const parsed = YAML.parse(raw) as Record<string, unknown>;
      return {
        ...defaultConfig,
        maxParallelWorkers: num(parsed.maxParallelWorkers, defaultConfig.maxParallelWorkers!),
        testCommand: str(parsed.testCommand),
        lintCommand: str(parsed.lintCommand),
        sqlitePath: str(parsed.sqlitePath) ?? defaultConfig.sqlitePath,
        statusMdPath: str(parsed.statusMdPath) ?? defaultConfig.statusMdPath,
        autoCursorCloudAgentOnStart: parsed.autoCursorCloudAgentOnStart !== false,
        cursorCloudAgent: parseCursorCloudAgent(parsed.cursorCloudAgent),
        featureWorktree: parseFeatureWorktree(parsed.featureWorktree),
        featureStartCommand: parseFeatureStartCommand(parsed.featureStartCommand),
      };
    }
  }
  return { ...defaultConfig };
}

function num(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}

function parseCursorCloudAgent(raw: unknown): CursorCloudAgentYamlConfig | undefined {
  if (raw === null || raw === undefined || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const repository = str(o.repository);
  const enabled = bool(o.enabled, false);
  if (!enabled && !repository) return undefined;
  return {
    enabled,
    repository: repository ?? "",
    ref: str(o.ref) ?? "main",
    apiKeyEnv: str(o.apiKeyEnv) ?? "CURSOR_API_KEY",
    model: str(o.model),
    branchNamePrefix: str(o.branchNamePrefix) ?? "orch-feature",
    pollStatus: bool(o.pollStatus, true),
    pollIntervalSeconds: num(o.pollIntervalSeconds, 30),
  };
}

function parseFeatureStartCommand(raw: unknown): string | string[] | undefined {
  if (raw === null || raw === undefined) return undefined;
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw) && raw.every((x) => typeof x === "string")) {
    return raw as string[];
  }
  return undefined;
}

function parseFeatureWorktree(raw: unknown): FeatureWorktreeYamlConfig | undefined {
  if (raw === null || raw === undefined) return undefined;
  if (typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  return {
    enabled: bool(o.enabled, true),
    root: str(o.root) ?? ".orchestrator/feature-worktrees",
    branchPrefix: str(o.branchPrefix) ?? "orch-feature",
    spawnDefaultHook: bool(o.spawnDefaultHook, true),
    openWithCursor: bool(o.openWithCursor, false),
  };
}
