## Completion truth contract (task-engine)

This package defines and enforces an explicit completion truth contract for task-engine
execution in `src/completion-truth.ts` and `src/feature-task-engine.ts`.

### 1) Task terminal truth

A task is terminal only when task status is one of:

- `done`
- `failed`
- `blocked`

### 2) Integration result truth

For each terminal task, the engine stores `taskCompletionTruthById[taskId]` in
feature links (`feature_runs.links_json`) with:

- `taskTerminal` (derived from status)
- `integrationResult`:
  - `integrated` (task branch merged into integration branch)
  - `not_integrated` (task was `done` but merge did not complete)
  - `not_applicable` (`failed`/`blocked` terminal task)
- `nonIntegratedReason` (required when `integrationResult = not_integrated`)

### 3) Non-integrated reason taxonomy

When a task reaches `done` but is not integrated, reason is one of:

- `missing_task_branch`
- `merge_not_attempted`
- `merge_failed`
- `integration_branch_unavailable`

### 4) Feature-level done gate

Feature completion is considered truthful only if all checks pass:

1. all tasks are terminal
2. no task is `failed`
3. no task is `blocked`
4. every `done` task has `integrationResult = integrated`
5. merge auditor reaches `FINISHED`

The computed gate object is stored as `featureDoneGateTruth` in links and is used
to decide final feature status (`completed` or `failed`).

### Contract version

`completionTruthContractVersion` is persisted in feature links so UI/API consumers
can detect the exact contract semantics used for a run.
# @orch-os/api

Fastify server: **SQLite** persistence, **SSE** events, **REST** under `/api/v1/*`, static **`@orch-os/ui`** build at `/`.

```ts
import { buildServer } from "@orch-os/api";

const app = await buildServer({ cwd: process.cwd() });
await app.listen({ port: 45210, host: "127.0.0.1" });
```
