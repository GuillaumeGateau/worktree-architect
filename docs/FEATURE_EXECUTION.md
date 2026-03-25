# Feature runs — what executes on Start?

This doc matches **current behavior** in the Orchestration OS monorepo.

## `CURSOR_API_KEY` (not automatic from the IDE)

Using Cursor as your editor **does not** inject a Cloud Agents API key into this repo. The key is a **separate credential** for `https://api.cursor.com`.

1. Open **[Cursor Dashboard → Cloud Agents](https://cursor.com/dashboard/cloud-agents)** (sign in with the same account you use in the app, if required).
2. Create an **API key** and copy it once (it may not be shown again).
3. Put it in a **`.env`** file at the **repository root** (same folder as `orchestrator.config.yaml`):

   ```bash
   cp .env.example .env
   # edit .env — set CURSOR_API_KEY=...
   ```

The **`orchestrator`** CLI loads **`.env`** automatically on startup (`dotenv`). **`.env`** is gitignored — never commit keys.

Docs: [Cloud Agents API overview](https://cursor.com/docs/cloud-agent/api/overview).

## Auto Cursor Cloud on Start (hands-off implementation)

By default (**`autoCursorCloudAgentOnStart`** is not `false` in **`orchestrator.config.yaml`**):

- If **`CURSOR_API_KEY`** (or **`apiKeyEnv`**) is set in the environment and **`git remote get-url origin`** points at **GitHub**, **Start** launches a **Cursor Cloud Agent** automatically — you do **not** need **`cursorCloudAgent.enabled: true`** in YAML.
- The agent prompt tells it to **implement the plan without waiting for dashboard clicks**, including files under **`links.targetPath`** when set (e.g. **`test-apps/...`**).
- **Activity** logs an extra line when this auto-launch path is used; **`links.cursorCloudAutoLaunched`** is set to **`true`**.
- To **turn this off** (local-only worktree + hooks), set **`autoCursorCloudAgentOnStart: false`**.
- If **`cursorCloudAgent.enabled: true`** is set explicitly, that block wins; empty **`repository`** is filled from **`git origin`** when possible.

**GitHub must contain your orchestrator changes:** Cursor Cloud clones **`source.repository`** at **`source.ref`** (default **`main`**). Uncommitted or unpushed local commits are **not** visible to the agent. After changing **`packages/`**, prompts, or Feature Start behavior, **`git push`** the branch you use as **`ref`** before (or after) clicking **Start** so the agent runs against the code you expect.

## Orchestrator working directory (git root)

`orchestrator start` resolves **`git rev-parse --show-toplevel`** from your shell **cwd** and uses that directory as the repo root for the SQLite DB, **`orchestrator.config.yaml`**, **`.orchestrator/instance.json`**, Feature Start **worktrees**, and **`scripts/orch-feature-start-worker.mjs`**. Starting from **`packages/...`** inside a git clone therefore still targets the real repository (and avoids false “not a git repo” worktree failures).

## Always (every configuration)

When you click **Start** (or `POST /api/v1/features/:id/start`):

- The run’s status becomes **`executing`**.
- The **first** pending step (by `ordinal`) becomes **`active`**.
- SSE emits **`feature_updated`** / **`step_updated`**.
- **Activity** is seeded with a **plan** line (“Provisioning execution environment…”).
- **`links.featureStartMode`** is set for the dashboard (`plan_only`, `local_worktree`, `local_hook`, `cursor_cloud`, cloud misconfiguration / launch failure codes).

## Default: git worktree + default worker

Unless you disable it in **`orchestrator.config.yaml`**, **`featureWorktree`** defaults to:

- **`enabled: true`** — the API runs **`git worktree add`** under **`root`** (default **`.orchestrator/feature-worktrees/<feature-id>`**), new branch **`branchPrefix-<sanitized-id>`**.
- **`spawnDefaultHook: true`** — if **`featureStartCommand`** is not set, the API spawns **`node scripts/orch-feature-start-worker.mjs`** with **`cwd`** = the worktree path (or repo root if worktree creation failed).
- Environment for hooks: **`ORCH_FEATURE_ID`**, **`ORCH_CWD`** (repo root), **`ORCH_WORKTREE_PATH`** (absolute worktree path when created).

**`links`** may include **`worktreePath`**, **`worktreeBranch`**, **`worktreeCreatedAt`**, or **`worktreeError`** if git is missing or worktree creation failed.

**`openWithCursor: true`** (optional) attempts **`cursor <worktreePath>`** on your PATH after the hook is spawned (best effort; a **note** or **error** activity records the outcome).

## Explicit `cursorCloudAgent` block (optional)

You can still set **`cursorCloudAgent`** in YAML for **`ref`**, **`pollStatus`**, **`model`**, or a fixed **`repository`**. The API calls **`POST https://api.cursor.com/v0/agents`** **after** the worktree step when cloud is active. Local worktree + cloud can both apply; the dashboard shows both.

- **`links.cursorAgentUrl`**, **`links.cursorAgentId`**, **`featureStartMode: cursor_cloud`** on success.
- Misconfiguration uses **`cloud_missing_repository`**, **`cloud_missing_api_key`**, or **`cloud_launch_failed`**; a **local hook can still run** afterward.

**Requirements and limits:**

- The cloud agent runs against the **GitHub** clone Cursor uses — not uncommitted local-only files until they are on the remote branch you set in **`ref`**.
- Your local orchestrator at **`127.0.0.1`** is usually **not** reachable from Cursor Cloud. Set **`ORCHESTRATOR_ACTIVITY_BASE_URL`** to a **tunneled** public base URL if you want the cloud agent to POST activity into this API.
- API key: see **`CURSOR_API_KEY`** above; **never commit** `.env`.

Reference: [Cursor Cloud Agents OpenAPI](https://cursor.com/docs-static/cloud-agents-openapi.yaml).

## Optional: custom `featureStartCommand`

If set (shell string or argv array), it runs **instead of** the default worker (when you want full control). Same **`cwd`** rules (worktree when present). Placeholders: **`{{featureId}}`**, **`{{cwd}}`** (repo root).

Exit **0** → activity **`tool`** “completed”; non-zero → activity **`error`** with stderr/stdout tail.

## Disable worktrees / default hook

```yaml
featureWorktree:
  enabled: false
  spawnDefaultHook: false
```

Then Start falls back to **manual** behavior unless **`cursorCloudAgent`** or **`featureStartCommand`** provides automation.

## Summary

| Mechanism | When | What runs |
|-----------|------|-----------|
| **Worktree** (default) | Start + git repo | **`git worktree add`** → **`links.worktreePath`** |
| **Default worker** | Start + `spawnDefaultHook` + script present | **`scripts/orch-feature-start-worker.mjs`** → POSTs **activity** |
| **`featureStartCommand`** | Start, replaces default worker when set | Your command in worktree **cwd** |
| **`openWithCursor`** | Start + worktree + flag | **`cursor <path>`** (local CLI) |
| **Auto Cursor Cloud** | Start + key + GitHub `origin` (default) | Cursor **Cloud** agent (no YAML block) |
| **`cursorCloudAgent`** | Start + explicit block / overrides | Cursor **Cloud** agent on GitHub |
| **Manual** | Anytime | CLI / API **activity**, step **PATCH** |

## Worktree cleanup

Removing a feature run does **not** yet auto-run **`git worktree remove`**. Delete the tree manually when done, or add automation later.

## `orchestrator doctor`

From the repo root, **`orchestrator doctor`** prints worktree defaults and whether Cursor Cloud / custom hooks look configured (without printing secret values).
