# Architecture

## Components

| Piece | Role |
|-------|------|
| `@orch-os/core` | Shared types, Zod schemas, JSON Schema export (`job-envelope.schema.json`, `create-feature-body.schema.json`). |
| `@orch-os/api` | Fastify HTTP + SQLite (`better-sqlite3`) + SSE `/api/v1/events` + static UI. |
| `@orch-os/ui` | Vite/React dashboard (same-origin API). |
| `@orch-os/cli` | `start`, `url`, `doctor`, `init`, `job …`, **`feature create|list|show|start|cancel|activity|steps`**. |
| `orchestrator-plugins` (Python) | Optional validators / subprocess gates. |

## Data flow (default)

```mermaid
flowchart LR
  CLI[orchestrator_start]
  API[Fastify_API]
  SQL[SQLite]
  UI[React_UI]
  CLI --> API
  API --> SQL
  UI -->|fetch_SSE| API
```

- **Jobs** persist in SQLite (`jobs`, `workers` tables).
- **Feature runs** persist in SQLite (`feature_runs`, `feature_steps`, `activity_events` — activity is append-only).
- **Live UI** subscribes to **SSE** (`/api/v1/events`). Job mutations emit `job_created` / `job_updated`. Feature mutations emit `feature_created`, `feature_updated`, `step_updated`, `activity_appended`.
- **STATUS.md** is regenerated on job writes (path from `orchestrator.config.yaml`).

## Instance file (agent discovery)

After `orchestrator start`, **`.orchestrator/instance.json`** contains:

- `baseUrl`, `port`, `pid`, `startedAt`, `instanceToken`, optional `apiKey`.

The file is **gitignored**. On the next `start`, the CLI **SIGTERM**s the previous **recorded PID** when still alive, then binds a port in **`45200–45499`** (or `ORCHESTRATOR_PORT`, or `--port`).

### `--steal-port` / `ORCHESTRATOR_STEAL_PORT=1`

Best-effort **`lsof` + SIGTERM** on listeners (macOS/Linux). This can affect **non-orchestrator** processes — keep off unless you understand the risk.

## Redis

`REDIS_URL` is reserved for an optional **scale** profile. The current build **does not** fan out work to Redis; it only prints a stderr notice. Prefer **SQLite + single API process** for the default path.

## Security

- Default bind: **127.0.0.1**.
- Optional **`x-api-key`** when `ORCHESTRATOR_API_KEY` / `instance.json` includes `apiKey`.
- Treat the dashboard as **local dev tooling**, not a public multi-tenant service.

## Feature runs (high level)

- **Create** (`POST /api/v1/features`) stores metadata + optional `steps[]` (human plan). Default status is `draft` if omitted.
- **Start** (`POST …/start`) moves the run to `executing` and activates the first pending step (ordinal order). Optionally launches a **Cursor Cloud Agent** or **`featureStartCommand`** when configured in `orchestrator.config.yaml`. See **[FEATURE_EXECUTION.md](FEATURE_EXECUTION.md)**.
- **Activity** (`POST …/activity`) appends timeline events (`plan`, `agent`, `tool`, `error`, `merge`, `note`) for the dashboard feed — **only when callers POST**.
- **Dashboard**: **Features** tab (default) vs **Jobs (legacy)**; **Start** in the UI matches the API start endpoint.

## Contract versioning

`contractVersion` on jobs aligns tri-tier **FE/BE** contracts; bump when `INTERFACE_CONTRACT.md` / `PREDICTIVE_MAP.json` change under approval workflows.
