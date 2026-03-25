import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";

const execFileAsync = promisify(execFile);

export type WorktreeResult =
  | { ok: true; path: string; branch: string }
  | { ok: false; error: string };

/** Safe path segment and git branch suffix from feature id. */
export function sanitizeFeatureIdForFs(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 120) || "feature";
}

function sanitizeBranchName(prefix: string, safeId: string): string {
  const raw = `${prefix}-${safeId}`.replace(/[^a-zA-Z0-9._/-]/g, "-");
  const trimmed = raw.replace(/^-+/, "").slice(0, 200);
  return trimmed || "orch-feature-branch";
}

/**
 * Create a git worktree for a feature under repoRoot/rootRel/safeId with a new branch.
 */
export async function createWorktreeForFeature(opts: {
  repoRoot: string;
  featureId: string;
  rootRel: string;
  branchPrefix: string;
}): Promise<WorktreeResult> {
  const { repoRoot, featureId, rootRel, branchPrefix } = opts;
  const safeId = sanitizeFeatureIdForFs(featureId);
  const branchName = sanitizeBranchName(branchPrefix, safeId);
  const baseDir = resolve(repoRoot, rootRel);
  const worktreePath = join(baseDir, safeId);

  try {
    const { stdout } = await execFileAsync("git", ["-C", repoRoot, "rev-parse", "--is-inside-work-tree"], {
      encoding: "utf8",
    });
    if (stdout.trim() !== "true") {
      return { ok: false, error: "cwd is not a git work tree" };
    }
  } catch {
    return { ok: false, error: "not a git repository (git rev-parse failed)" };
  }

  if (existsSync(worktreePath)) {
    return { ok: false, error: `worktree path already exists: ${worktreePath}` };
  }

  try {
    await mkdir(baseDir, { recursive: true });
  } catch (e) {
    return { ok: false, error: `mkdir failed: ${(e as Error).message}` };
  }

  // Use --no-checkout so git doesn't try to write IDE/OS-protected paths (e.g. .cursor/) from HEAD.
  // The hook/agent uses ORCH_CWD (repo root) for file access; the worktree provides git isolation only.
  try {
    await execFileAsync(
      "git",
      ["-C", repoRoot, "worktree", "add", "--no-checkout", "-b", branchName, worktreePath, "HEAD"],
      { encoding: "utf8" }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `git worktree add failed: ${msg}` };
  }

  return { ok: true, path: resolve(worktreePath), branch: branchName };
}

/**
 * Best-effort open folder in Cursor via CLI. Fires async; calls onDone with a user-facing message.
 */
export function spawnCursorOpenWorktree(
  worktreePath: string,
  onDone: (message: string, kind: "note" | "error") => void
): void {
  const child = spawn("cursor", [worktreePath], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
  child.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "ENOENT") {
      onDone("Cursor CLI not found on PATH (`cursor`)", "error");
    } else {
      onDone(`Cursor CLI spawn error: ${err.message}`, "error");
    }
  });
  child.on("spawn", () => {
    onDone(`Opened worktree in Cursor (pid ${child.pid}).`, "note");
  });
}
