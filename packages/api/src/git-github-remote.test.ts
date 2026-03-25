import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { normalizeToGithubHttps, resolveGitRepositoryRoot } from "./git-github-remote.js";

describe("git-github-remote", () => {
  let dir: string;
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it("resolveGitRepositoryRoot finds top-level from a subdirectory (this monorepo)", () => {
    const thisFile = fileURLToPath(import.meta.url);
    const apiSrc = join(thisFile, "..");
    const repoRoot = resolve(apiSrc, "..", "..", "..");
    const sub = join(repoRoot, "packages", "api", "src");
    expect(resolveGitRepositoryRoot(sub)).toBe(repoRoot);
  });

  it("resolveGitRepositoryRoot returns input when not a git repo", () => {
    dir = mkdtempSync(join(tmpdir(), "orch-nogit-"));
    expect(resolveGitRepositoryRoot(dir)).toBe(dir);
  });

  it("normalizeToGithubHttps handles ssh and https", () => {
    expect(normalizeToGithubHttps("git@github.com:org/repo.git")).toBe("https://github.com/org/repo");
    expect(normalizeToGithubHttps("https://github.com/org/repo")).toBe("https://github.com/org/repo");
    expect(normalizeToGithubHttps("https://github.com/org/repo.git/")).toBe("https://github.com/org/repo");
  });
});
