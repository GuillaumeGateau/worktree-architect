# /build-feature

Apply the **orch-build-feature** skill:

- **Global (every project):** `~/.cursor/skills/orch-build-feature/SKILL.md` — install once with `npm run install:cursor-global` from the orch-os repo (`~` is your **home** directory, e.g. `/Users/you` on macOS).
- **This repo only:** `.cursor/skills/orch-build-feature/SKILL.md` (no `~`; path is inside the workspace).

## Scope (read first)

- **Product (default):** improve real code — in orch-os that means `packages/`, `install/`, `docs/`, etc. In **other repos**, normal app features.
- **test-app:** if the user’s message **starts with** `test-app` (e.g. `/build-feature test-app hangman`), follow the skill’s **test-app scope** (disposable work under `test-apps/` **in this monorepo only**). Or use **`/build-feature-test-app`** to force that mode.

## Default flow

1. **Understand** the user’s goal; pick **product** vs **test-app** scope per the skill.
2. **Draft** structured **CreateFeatureBody** JSON (`title`, `summary`, `steps[]`, `links` with `orchScope` / `targetPath` when test-app).
3. **Create** the run from the **current workspace root**:

   ```bash
   orchestrator feature create --json-file ./.orchestrator/feature-plan.json
   ```

4. **Print** dashboard URL: `orchestrator url` or `.orchestrator/instance.json` → `baseUrl`.
5. **Do not** `orchestrator feature start` unless the user explicitly asks; default is **Start in the UI**.
6. **Do not** implement the whole feature in the same turn right after create — wait for **Start** (unless user opts out). **Start does not spawn subagents**; see **`docs/FEATURE_EXECUTION.md`**.

## After creation

- Share **feature id** and dashboard **Features** tab.
- After Start, log milestones: `orchestrator feature activity <id> --kind agent -m "…"`

## API key

If `ORCHESTRATOR_API_KEY` / `instance.json` has a key, send `x-api-key` the same way other `orchestrator` commands do.
