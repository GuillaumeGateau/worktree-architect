# /build-feature-test-app

Same as **`/build-feature`**, but **always** use **test-app scope** from **orch-build-feature**:

- Disposable validation under **`test-apps/<kebab-slug>/`** in the **orch-os** monorepo (gitignored; see `docs/TESTING.md`).
- Feature JSON must include `links.orchScope` = `"test-apps"`, `links.targetPath` = `"test-apps/<kebab-slug>"`, and `title` prefixed with **`[test-app]`**.

Do **not** use this command to change `packages/*` or shipped product code.

**Execution:** **Start** updates DB state and, if **`cursorCloudAgent`** + **`CURSOR_API_KEY`** + **`repository`** are set, launches a **Cursor Cloud Agent**. Otherwise use **`feature activity`** or local hooks; see **`docs/FEATURE_EXECUTION.md`**.

## Dashboard-first (do not skip)

1. Orchestrator running: **`npm run orchestrator -- start`** → open the printed dashboard URL.
2. **First in chat:** **`orchestrator feature create`** with plan JSON so the run appears under **Features**.
3. Tell the user the **feature id** and **`orchestrator url`**; they **click Start** in the UI. Do **not** implement code in the same turn as create unless they explicitly opt out.
4. After **Start**, implement and log **`orchestrator feature activity`**.

If the open folder is **not** the orch-os repo (or has no `test-apps/` convention), say so and switch to **`/build-feature`** (product scope) or confirm a sandbox path with the user.

Apply skill: `~/.cursor/skills/orch-build-feature/SKILL.md` or `.cursor/skills/orch-build-feature/SKILL.md`.
