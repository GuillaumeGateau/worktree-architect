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
| `feature create` | `POST /api/v1/features` (`--json-file`, `--title`, or stdin JSON) |
| `feature list` / `feature show <id>` | List or fetch one run (+ steps on show) |
| `feature start <id>` / `feature cancel <id>` | Start or cancel a run |
| `feature activity <id> -m "…"` | Append activity (`--kind`, `--step-id`) |
| `feature steps <id> --json-file f.json` | `PUT` plan (`{ "steps": [...] }`) |

Environment: `ORCHESTRATOR_PORT`, `ORCHESTRATOR_STEAL_PORT`, `ORCHESTRATOR_API_KEY`, `ORCHESTRATOR_BASE_URL`.
