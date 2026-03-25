import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";

export type OrchestratorYamlConfig = {
  maxParallelWorkers?: number;
  testCommand?: string;
  lintCommand?: string;
  sqlitePath?: string;
  statusMdPath?: string;
};

const defaultConfig: OrchestratorYamlConfig = {
  maxParallelWorkers: 8,
  sqlitePath: ".orchestrator/orchestrator.db",
  statusMdPath: ".orchestrator/STATUS.md",
};

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
