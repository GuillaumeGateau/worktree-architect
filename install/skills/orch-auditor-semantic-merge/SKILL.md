---
name: orch-auditor-semantic-merge
description: Semantic merge review — compare merged code to FEATURE_GOALS.md and INTERFACE_CONTRACT.md; run tests; do not rely on textual merge cleanliness alone. Use when integrating L2 worktrees or feature branches.
---

# Auditor — Semantic merge

1. Read `FEATURE_GOALS.md`, `INTERFACE_CONTRACT.md`, and `PREDICTIVE_MAP.json` (`contract_version`).
2. After merge or squash, verify types, field names, and runtime behavior match the **approved** contract.
3. Run the project test suite (or commands in `orchestrator.config.yaml`).
4. If semantics drift, fix code or reopen contract approval — do not “pick ours/theirs” without analysis.
