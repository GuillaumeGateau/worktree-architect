import { execFileSync } from "node:child_process";

/**
 * If `startDir` is inside a git working tree, return `git rev-parse --show-toplevel`.
 * Otherwise returns `startDir` unchanged (orchestrator still works for non-git sandboxes).
 */
export function resolveGitRepositoryRoot(startDir: string): string {
  try {
    const root = execFileSync("git", ["-C", startDir, "rev-parse", "--show-toplevel"], {
      encoding: "utf8",
    }).trim();
    if (root.length > 0) return root;
  } catch {
    /* not a git repo or git missing */
  }
  return startDir;
}

/**
 * Read `git remote get-url origin` and normalize to https://github.com/org/repo
 * when the remote is GitHub (HTTPS or SSH).
 */
export function inferGitHubHttpsRepository(repoRoot: string): string | undefined {
  try {
    const url = execFileSync("git", ["-C", repoRoot, "remote", "get-url", "origin"], {
      encoding: "utf8",
    }).trim();
    if (!url) return undefined;
    return normalizeToGithubHttps(url);
  } catch {
    return undefined;
  }
}

export function normalizeToGithubHttps(url: string): string | undefined {
  const u = url.trim();
  if (!u) return undefined;

  if (u.startsWith("git@github.com:")) {
    const path = u.slice("git@github.com:".length).replace(/\.git$/i, "").replace(/\/$/, "");
    if (path.length > 0) return `https://github.com/${path}`;
    return undefined;
  }

  if (u.startsWith("ssh://git@github.com/")) {
    const path = u.replace(/^ssh:\/\/git@github\.com\//i, "").replace(/\.git$/i, "").replace(/\/$/, "");
    if (path.length > 0) return `https://github.com/${path}`;
    return undefined;
  }

  const lower = u.toLowerCase();
  if (lower.includes("github.com")) {
    try {
      const parsed = new URL(u);
      if (!parsed.hostname.toLowerCase().endsWith("github.com")) return undefined;
      const path = parsed.pathname
        .replace(/^\//, "")
        .replace(/\/$/, "")
        .replace(/\.git$/i, "");
      if (!path || !path.includes("/")) return undefined;
      return `https://github.com/${path}`;
    } catch {
      return undefined;
    }
  }

  return undefined;
}
