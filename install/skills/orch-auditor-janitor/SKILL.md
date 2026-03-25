---
name: orch-auditor-janitor
description: Workspace janitor — after successful L2 merge, remove git worktree and delete branch; update queue state. Use immediately after a successful merge from an L2 worktree.
---

# Auditor — Janitor

```bash
git worktree remove <path> --force
git branch -d <branch>
```

Update `PENDING_QUEUE.json` / orchestrator job entries to `done` and clear `active_l2` slots when using tri-tier state files.
