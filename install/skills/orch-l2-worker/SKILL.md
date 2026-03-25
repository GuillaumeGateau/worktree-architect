---
name: orch-l2-worker
description: L2 worker — isolated worktree execution against contract slices; uses global-cleansing-standards; escalates on contract drift. Use when implementing a queued task in a dedicated worktree.
---

# L2 Worker

## Isolation

- Confirm cwd is the **assigned worktree** before editing.
- Touch only paths allowed by the queue entry / contract slice.

## Standards

- Continuously apply **`global-cleansing-standards.mdc`**.

## Orchestrator

- Resolve **`orchestrator url`** for API calls.
- On completion, move job status through **`orchestrator`-compatible PATCH** or CLI helpers when available.

## Escalation

- If a dependency is deprecated or the contract is impossible, write `ORCHESTRATION_ESCALATION.json` (or append to state file), set dependent tasks `blocked`, bump `contract_version`, and require **new human approval** of the contract.
