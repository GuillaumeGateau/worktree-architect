#!/usr/bin/env node
/**
 * Default Feature Start hook: POSTs a tool activity so the dashboard shows real execution.
 * Env: ORCH_FEATURE_ID, ORCH_CWD (repo root), ORCH_WORKTREE_PATH (optional).
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const featureId = process.env.ORCH_FEATURE_ID;
const repoRoot = process.env.ORCH_CWD || process.cwd();
const worktree = process.env.ORCH_WORKTREE_PATH || process.cwd();

async function main() {
  if (!featureId) {
    console.error("orch-feature-start-worker: missing ORCH_FEATURE_ID");
    process.exit(1);
  }
  let baseUrl = process.env.ORCHESTRATOR_BASE_URL;
  let apiKey;
  const instPath = join(repoRoot, ".orchestrator", "instance.json");
  if (existsSync(instPath)) {
    try {
      const j = JSON.parse(readFileSync(instPath, "utf8"));
      baseUrl = baseUrl || j.baseUrl;
      apiKey = j.apiKey;
    } catch {
      /* ignore */
    }
  }
  if (!baseUrl) {
    console.error("orch-feature-start-worker: no API base URL (instance.json or ORCHESTRATOR_BASE_URL)");
    process.exit(1);
  }
  const root = baseUrl.replace(/\/$/, "");
  const headers = { "content-type": "application/json" };
  if (apiKey) headers["x-api-key"] = apiKey;
  const msg = `Default start worker ran (worktree: ${worktree}).`;
  const r = await fetch(`${root}/api/v1/features/${encodeURIComponent(featureId)}/activity`, {
    method: "POST",
    headers,
    body: JSON.stringify({ kind: "tool", message: msg }),
  });
  if (!r.ok) {
    console.error(await r.text());
    process.exit(1);
  }
  console.log(msg);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
