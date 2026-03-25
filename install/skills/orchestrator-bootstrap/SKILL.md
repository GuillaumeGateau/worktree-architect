---
name: orchestrator-bootstrap
description: Scans a repository and adds Orchestration OS project wiring — orchestrator.config.yaml, .orchestrator gitignore hints, package.json script orchestrator:start, optional Redis compose. Use when the user runs /orchestrate-bootstrap or asks to adopt Orchestration OS in a project.
---

# Orchestrator bootstrap

## Preconditions

- User wants this project to use **Orchestration OS** (`@orch-os/cli` + optional `@orch-os/core` types).

## Steps

1. **Detect stack:** `package.json` (npm/pnpm/yarn), `pyproject.toml` / `requirements.txt`, `go.mod`, `Dockerfile`, `.github/workflows/*`.
2. If missing, create **`orchestrator.config.yaml`** at repo root with sensible `testCommand` / `lintCommand` (e.g. `npm test`, `ruff check`, `go test ./...`).
3. Ensure **`.gitignore`** includes:
   - `.orchestrator/instance.json`
   - `.orchestrator/*.db`, `*.db-wal`, `*.db-shm`
   - `.orchestrator/logs/` (optional)
4. Add **devDependency** `@orch-os/cli` (or document `npx` once published) and script:
   - `"orchestrator:start": "orchestrator start"`
5. Optionally add **`docker-compose.orchestrator.yml`** with Redis **only** if the user explicitly opts into the scale profile.
6. Summarize edits as a checklist; apply only after user confirmation unless they asked for auto-apply.

## Reference

- Monorepo docs: `docs/NEW_PROJECT.md`, `docs/ARCHITECTURE.md` in the `orch-os` repository.
