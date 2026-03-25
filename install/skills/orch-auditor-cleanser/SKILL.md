---
name: orch-auditor-cleanser
description: Code cleanser — format, lint, strip debug noise per global-cleansing-standards before promoting work from L2. Use when a job is ready_for_cleanse or before merge from a worktree.
---

# Auditor — Cleanser

1. Run project formatter + linter.
2. Remove forbidden debug output unless the contract requires structured logging.
3. Re-check **`global-cleansing-standards.mdc`**.
4. If anything fails, return a concrete checklist to L2 — do not merge.
