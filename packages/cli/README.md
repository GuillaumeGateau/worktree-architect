# @orch-os/cli

Binary: **`orchestrator`**

| Command | Purpose |
|---------|---------|
| `start` | Dynamic port, prior PID shutdown, writes `instance.json`, serves API+UI |
| `url` | Print `baseUrl` |
| `doctor` | Health check via instance file |
| `diag` | JSON diagnostics for config/instance/env + optional health probe |
| `init` | `orchestrator.config.yaml` + `.orchestrator/` + gitignore hints |
| `job enqueue <yaml>` | `POST /api/v1/jobs` |
| `job patch <id> --status <s>` | Advance job (`queued` → `claimed` → `running` → `succeeded`) |
| `job watch` | Poll jobs |

Environment: `ORCHESTRATOR_PORT`, `ORCHESTRATOR_STEAL_PORT`, `ORCHESTRATOR_API_KEY`, `ORCHESTRATOR_BASE_URL`.
