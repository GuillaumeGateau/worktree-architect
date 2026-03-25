import { spawn } from "node:child_process";

function substitutePlaceholders(s: string, featureId: string, repoRoot: string): string {
  return s.replace(/\{\{featureId\}\}/g, featureId).replace(/\{\{cwd\}\}/g, repoRoot);
}

/**
 * Run optional local hook after Feature Start (fire-and-forget).
 * Sets ORCH_FEATURE_ID, ORCH_CWD (repo root), ORCH_WORKTREE_PATH when provided.
 * `hookCwd` is usually the feature worktree; `repoRoot` is the main repository root for placeholders.
 */
export function spawnFeatureStartCommand(
  command: string | string[],
  hookCwd: string,
  repoRoot: string,
  featureId: string,
  worktreePath: string | undefined,
  onDone: (exitCode: number | null, stdout: string, stderr: string) => void
): void {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ORCH_FEATURE_ID: featureId,
    ORCH_CWD: repoRoot,
    ...(worktreePath ? { ORCH_WORKTREE_PATH: worktreePath } : {}),
  };
  let child;
  if (typeof command === "string") {
    const line = substitutePlaceholders(command, featureId, repoRoot);
    child = spawn(line, {
      cwd: hookCwd,
      env,
      shell: true,
      windowsHide: true,
    });
  } else {
    const argv = command.map((a) => substitutePlaceholders(a, featureId, repoRoot));
    if (argv.length === 0) {
      onDone(1, "", "empty featureStartCommand argv");
      return;
    }
    child = spawn(argv[0], argv.slice(1), {
      cwd: hookCwd,
      env,
      windowsHide: true,
    });
  }
  let stdout = "";
  let stderr = "";
  const cap = 8000;
  child.stdout?.on("data", (chunk: Buffer) => {
    stdout += chunk.toString("utf8");
    if (stdout.length > cap) stdout = stdout.slice(-cap);
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    stderr += chunk.toString("utf8");
    if (stderr.length > cap) stderr = stderr.slice(-cap);
  });
  child.on("error", (err) => {
    onDone(1, stdout, `${stderr}\n${err.message}`.trim());
  });
  child.on("close", (code) => {
    onDone(code, stdout, stderr);
  });
}
