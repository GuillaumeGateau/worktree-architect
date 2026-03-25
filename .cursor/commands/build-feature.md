# /build-feature

Apply **orch-build-feature**:

- **This repo:** `.cursor/skills/orch-build-feature/SKILL.md`
- **Every repo (after global install):** `~/.cursor/skills/orch-build-feature/SKILL.md` — run `npm run install:cursor-global` once from orch-os (`~` = your home directory).

## Scope

- **Product (default):** real work — here that means `packages/`, `install/`, `docs/`, etc.; in other clones, the app’s own code. **Not** under `test-apps/`.
- **test-app:** if the user writes **`test-app`** first (e.g. `/build-feature test-app hangman UI`), use **test-app scope**: files only under **`test-apps/<slug>/`**, `links.orchScope` / `links.targetPath` per skill. Or use **`/build-feature-test-app`**.

## Flow

1. Understand goal; choose scope per skill.
2. Emit **CreateFeatureBody** JSON → `orchestrator feature create` from workspace root.
3. Print `orchestrator url`; do **not** auto-`feature start` unless asked.
4. **Do not** build the entire feature in the same turn as create — wait for user **Start** in the UI unless they opt out. **Start does not spawn subagents** (`docs/FEATURE_EXECUTION.md`).

## API key

Use `x-api-key` when the project’s orchestrator is configured with a key.
