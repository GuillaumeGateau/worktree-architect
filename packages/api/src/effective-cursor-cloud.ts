import type { CursorCloudAgentYamlConfig, OrchestratorYamlConfig } from "./config.js";
import { inferGitHubHttpsRepository } from "./git-github-remote.js";

/**
 * Resolves Cursor Cloud Agent config for Feature Start:
 * - Honors explicit `cursorCloudAgent.enabled` + repository (infers repository when enabled but empty).
 * - When `autoCursorCloudAgentOnStart` is not false (default: on), `CURSOR_API_KEY` is set, and
 *   `origin` is a GitHub remote, enables cloud launch even if the YAML block is omitted or disabled.
 */
export function resolveEffectiveCursorCloudForStart(
  yaml: OrchestratorYamlConfig,
  cwd: string
): CursorCloudAgentYamlConfig | undefined {
  const explicit = yaml.cursorCloudAgent;
  const auto = yaml.autoCursorCloudAgentOnStart !== false;
  const apiKeyEnv = explicit?.apiKeyEnv ?? "CURSOR_API_KEY";
  const keyPresent = Boolean(process.env[apiKeyEnv]?.trim());
  const inferred = inferGitHubHttpsRepository(cwd);

  if (explicit && explicit.enabled === false) {
    return explicit;
  }

  if (explicit?.enabled) {
    const repo = explicit.repository?.trim() || inferred;
    return { ...explicit, repository: repo ?? "" };
  }

  if (auto && keyPresent && inferred) {
    return {
      enabled: true,
      repository: inferred,
      ref: explicit?.ref ?? "main",
      apiKeyEnv,
      model: explicit?.model,
      branchNamePrefix: explicit?.branchNamePrefix ?? "orch-feature",
      pollStatus: explicit?.pollStatus ?? true,
      pollIntervalSeconds: explicit?.pollIntervalSeconds ?? 30,
    };
  }

  return explicit;
}
