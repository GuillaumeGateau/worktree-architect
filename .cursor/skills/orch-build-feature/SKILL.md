---
name: orch-build-feature
description: Creates Orchestration OS Feature Runs from natural language — plan JSON, orchestrator feature create, dashboard URL, activity logging. Supports product vs test-app scope. Use for /build-feature, /build-feature-test-app, or “build this feature” with orchestrator.
---

# Build Feature (Feature Runs)

## Goal

Turn a user request into a **Feature Run** in **draft** or **ready**: clear title, short summary, ordered **steps**, optional risks/dependencies. The run appears in the dashboard **Features** tab; the user **Starts** when ready (default), unless they explicitly want the agent to call `feature start`.

## Dashboard-first UX (non-negotiable unless user opts out)

Users expect **slash commands** (`/build-feature`, `/build-feature-test-app`) to **show up in the Orchestrator UI** so they can **review the plan and click Start** — not for the agent to silently build the whole thing in chat while asking them to run random commands.

1. **Before any implementation:** ensure the orchestrator is reachable (`orchestrator start` → `instance.json` + dashboard URL). If it is not running, say so clearly and give the one-liner to start it.
2. **Always** run **`orchestrator feature create`** with the plan JSON in the **first** assistant turn for that request, so the feature row exists in **Features**.
3. **In your reply:** print the dashboard base URL (`orchestrator url`), the **feature id**, and instruct them to open **Features → Start** when ready.
4. **Do not** write app code under `test-apps/` or product paths in the same turn as `feature create`, unless the user explicitly asked to skip the gate (“just build it”, “no UI”, etc.).
5. **After Start** (they clicked it, or they told you execution is approved): implement work, use **`orchestrator feature activity`** for milestones, and PATCH steps when appropriate.

If you skip step 2–4, you are not following this product’s intended workflow.

## Critical — execution model

- **Start** (by default) creates a **git worktree** under **`.orchestrator/feature-worktrees/`** and runs **`scripts/orch-feature-start-worker.mjs`**, which **POSTs activity** so the dashboard is never silent. Hooks use **`ORCH_WORKTREE_PATH`** and **`cwd`** in that tree. Disable via **`featureWorktree`** in **`orchestrator.config.yaml`** — see **`docs/FEATURE_EXECUTION.md`**.
- **Auto Cursor Cloud (default):** with **`CURSOR_API_KEY`** in **`.env`** and **`git remote origin`** on **GitHub**, **Start** launches a **Cursor Cloud Agent** without enabling **`cursorCloudAgent`** in YAML (set **`autoCursorCloudAgentOnStart: false`** to disable). The agent is prompted to **implement the plan autonomously** (including **`links.targetPath`**).
- If **`cursorCloudAgent`** is set explicitly, it overrides / augments defaults (**`repository`** can be inferred from **`git origin`** when empty).
- **`featureStartCommand`** overrides the default worker; optional **`featureWorktree.openWithCursor`** tries the local **`cursor`** CLI on the worktree path.
- **After creating the run:** give the user the **feature id**, **dashboard URL**, and tell them to click **Start** when ready. **Do not** implement the entire feature in the **same** assistant turn unless the user explicitly asked to skip the gate or they already clicked Start and asked you to execute.
- **After Start:** implement work in manageable chunks and log milestones with `orchestrator feature activity <id> --kind agent -m "…"` (and step PATCH when appropriate). See **`docs/FEATURE_EXECUTION.md`** in the repo.

## Scope: product vs test-app

Pick **one** scope before writing the plan JSON.

### Product scope (default)

Use when:

- Improving **Orchestration OS itself** (`packages/`, `install/`, `docs/`, `scripts/`, `.cursor/` assets that ship with the repo, etc.), **or**
- Working in **any other repository** on a real feature (normal app code).

**Do not** put product or library changes under `test-apps/`.

Set `links.orchScope` to `"product"` when you want the dashboard to make this obvious (optional).

### test-app scope (disposable demos in this monorepo)

Use when:

- The user runs **`/build-feature-test-app`**, **or**
- The user runs **`/build-feature`** and the **first words** of their message are **`test-app`** (examples: `/build-feature test-app hangman`, `test-app: classic hangman`).

**Only when the workspace is the orch-os monorepo** (or any repo that documents a gitignored **`test-apps/`** tree — see `docs/TESTING.md`):

- All implementation files stay under **`test-apps/<kebab-slug>/`** (create the folder as needed).
- In the Feature Run JSON, set:
  - `links.orchScope` = `"test-apps"`
  - `links.targetPath` = `"test-apps/<kebab-slug>"` (single string)
- Prefix `title` with **`[test-app]`** so the dashboard shows it is disposable validation, not core product work.
- Mention in `summary` that output is **gitignored** / disposable.

If the user asks for **test-app** scope but the repo has **no** `test-apps/` convention, say so and either use **product** scope or a team-agreed sandbox folder after confirming.

## CreateFeatureBody shape (CLI / API)

Minimum:

- `title` (string, required)

Common fields:

- `summary` — one or two sentences for the dashboard hero.
- `status` — `draft` (default if omitted on server) or `ready` when the plan is complete and user could Start immediately.
- `risks` — free text (bullets ok).
- `dependencies` — repos, services, flags, or people.
- `links` — optional object (e.g. ticket URL, plus `orchScope` / `targetPath` as above).
- `steps` — array of `{ "title": "…", "summary"?: "…", "ordinal"?: number }`  
  Ordinals default to array order if omitted. Keep **3–12** steps when possible: concrete, verifiable, ordered.

## Plan quality

- **Titles**: imperative or outcome-based (“Add API route for X”, “Wire dashboard panel”).
- **Granularity**: each step should be a meaningful milestone, not a single line of code unless the feature is tiny.
- **Last steps**: often “Verify tests / manual smoke” or “Docs / changelog” when relevant (product scope); for test-app, “Open local HTML / smoke in browser” is enough.

## Commands (repo root)

Resolve base URL if needed: `orchestrator url`.

```bash
# Write JSON to a temp file, then:
orchestrator feature create --json-file ./plan.json

# Or stdin:
cat plan.json | orchestrator feature create
```

**Do not** `feature start` by default — UI Start is safer.

After the user (or you, if asked) begins execution:

```bash
orchestrator feature activity <featureId> --kind plan -m "Outlined approach…"
orchestrator feature activity <featureId> --kind agent -m "Implemented step 2…"
orchestrator feature activity <featureId> --kind error -m "Tests failed: …"
```

Kinds: `plan`, `agent`, `tool`, `error`, `merge`, `note`.

## Updating the plan

Replace steps wholesale:

```bash
orchestrator feature steps <id> --json-file ./steps.json
```

(`steps.json` must look like `{ "steps": [ … ] }`.)

## Reference

- Core types: `@orch-os/core` — `CreateFeatureBody`, `FeatureStepInput`.
- JSON Schema (when built): `packages/core/create-feature-body.schema.json` from `npm run build` in core + export script.
