## Feature run archive contract

Archive is **soft/non-destructive** at the run level:

- `feature_runs.archived` (`0|1`) marks whether a run is archived.
- `feature_runs.archived_at` (ISO timestamp) records archive time when archived.
- Archiving does **not** delete the run, its steps, tasks, or activity rows.

### API behavior

- `GET /api/v1/features` defaults to `archive=active`.
- Query param `archive` supports:
  - `active` (default): only non-archived runs
  - `archived`: only archived runs
  - `all`: both archived and active runs
- Invalid `archive` values return `400 { error: "invalid_query", ... }`.

Feature payloads include:

- `archived: boolean`
- `archivedAt?: string`
# @orch-os/api

Fastify server: **SQLite** persistence, **SSE** events, **REST** under `/api/v1/*`, static **`@orch-os/ui`** build at `/`.

```ts
import { buildServer } from "@orch-os/api";

const app = await buildServer({ cwd: process.cwd() });
await app.listen({ port: 45210, host: "127.0.0.1" });
```
