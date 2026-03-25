---
name: orch-l1-architect
description: L1 Architect phase — builds INTERFACE_CONTRACT.md, predictive maps, and queue files; enforces human contract approval before L2. Use after FEATURE_GOALS.md exists or when user says L1 / architect phase.
---

# L1 Architect (tri-tier)

## Outputs (repo root)

- `INTERFACE_CONTRACT.md` — APIs, payloads, errors, versioning.
- `PREDICTIVE_MAP.json` — machine-oriented cross-FE/BE assumptions (`contract_version`).
- `PENDING_QUEUE.json` — task state machine (`pending` / `active` / `blocked` / `done`).
- Optional `ORCHESTRATION_STATE.json` — `contract_approved`, `active_l2` (cap parallel work; config `maxParallelWorkers` in `orchestrator.config.yaml` aligns with orchestrator UI).

## Gates

- **No L2** until the human explicitly approves `INTERFACE_CONTRACT.md`.
- When using Orchestration OS, enqueue work via **`orchestrator job enqueue`** after the API is running (`orchestrator start`).
