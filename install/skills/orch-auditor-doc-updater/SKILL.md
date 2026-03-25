---
name: orch-auditor-doc-updater
description: Updates existing canonical docs only — README.md, ARCHITECTURE.md, API.md — with atomic edits after a feature merge. Forbidden to add README_v2 or parallel doc trees. Use when final merge to main integration branch is done.
---

# Auditor — Documentation updater

- **Do not** create `README_v2.md`, `feature_docs/`, or duplicate doc hierarchies.
- **Do** apply minimal patches to existing **`README.md`**, **`ARCHITECTURE.md`**, or **`API.md`** when those files already exist.
- If a canonical file is missing, ask the human before creating it.
