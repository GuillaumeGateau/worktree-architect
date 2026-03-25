#!/usr/bin/env node
/**
 * Pseudo technical check: Cursor Cloud agents use GitHub at `ref` (e.g. main), not your working tree.
 * Run from repo root after `git push` to confirm local main matches origin (or see how far ahead/behind).
 */
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function git(args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

try {
  const origin = git(["remote", "get-url", "origin"]);
  const head = git(["rev-parse", "HEAD"]);
  let upstream = "";
  try {
    upstream = git(["rev-parse", "--abbrev-ref", "@{u}"]);
  } catch {
    upstream = "(no upstream — set: git branch -u origin/main)";
  }
  let behind = "";
  try {
    behind = git(["rev-list", "--left-right", "--count", "HEAD...@{u}"]);
  } catch {
    behind = "n/a";
  }
  console.log("orch-sync: origin =", origin);
  console.log("orch-sync: HEAD  =", head.slice(0, 7), "…");
  console.log("orch-sync: upstream =", upstream);
  console.log("orch-sync: left-right behind|ahead (vs upstream) =", behind);
  if (!origin.includes("github.com")) {
    console.warn("orch-sync: warn — Cursor Cloud expects a GitHub HTTPS/SSH remote.");
    process.exitCode = 1;
  }
} catch (e) {
  console.error("orch-sync: failed — run from a git clone with origin set.", (e && e.message) || e);
  process.exit(1);
}
