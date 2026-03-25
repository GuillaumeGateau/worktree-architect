# /build-feature-test-app

Force **test-app scope** (see **orch-build-feature** skill): disposable work only under **`test-apps/<kebab-slug>/`** in this monorepo; `[test-app]` title prefix; `links.orchScope` / `links.targetPath` in the feature JSON.

Do not change `packages/*` or core product paths.

If the workspace is not orch-os (no `test-apps/` convention), tell the user and use **`/build-feature`** (product) or agree a sandbox folder.

Skill: `.cursor/skills/orch-build-feature/SKILL.md` or `~/.cursor/skills/orch-build-feature/SKILL.md`.

---

## Dashboard-first (do not skip)

The user approves work in the **Orchestrator dashboard Features tab**, not only in chat.

1. **Orchestrator must be running** (`npm run orchestrator -- start` from repo root). If there is no `instance.json`, tell them to start it and open the printed URL.
2. **First action in this chat:** build **CreateFeatureBody** JSON and run **`orchestrator feature create`** (from workspace root, `--json-file` or stdin) so the run **appears in the UI** immediately.
3. Reply with **`orchestrator url`**, the **feature id**, and: **open Features → select the run → click Start** when they are ready. **Do not** `feature start` from the CLI unless they asked.
4. **Do not** implement the game/product code in the **same** turn as create. After they **Start** in the UI (or explicitly tell you to proceed), continue implementation and log **`orchestrator feature activity`** as you go.

**Start** may launch a **Cursor Cloud Agent** when `cursorCloudAgent` + `CURSOR_API_KEY` + `repository` are set; otherwise it is DB + optional `featureStartCommand`. See `docs/FEATURE_EXECUTION.md`. Parallel work still flows from **their** Start + configured automation — not from jumping ahead in chat without the UI step.
