# UI validation findings and next fixes

## Validation scope

Feature: **shared office agent experience** (`-lC0eX_XlbVv`)

Executed checks:

- `npm test -w @orch-os/ui` (after dependency install): **pass** (6/6)
- `npm run build -w @orch-os/ui`: initially failed when `@orch-os/core` was not built; after `npm run build` at repo root, UI build **passes**
- Live smoke run via orchestrator CLI/API:
  - created feature run
  - set 2 ordered steps
  - started run
  - posted task/role activity events
  - cancelled run
  - re-read feature detail + activity + derived stage state

Smoke feature id used for validation: `JPZBq7k7kSoN`

## Integration evidence: completion trust signals

Evidence artifact: `packages/ui/src/feature-view-utils.test.ts`

Added test:

- `captures completion trust signals from source-of-truth activity and step statuses`

Evidence assertions in that test:

- Step source-of-truth statuses indicate no active tasks (`activeTaskCount = 0`)
- Activity-derived stage indicates no running cloud agents (`runningCloudAgentCount = 0`)
- Counter reconciliation holds (`activeTaskCount === runningCloudAgentCount`)
- Role trust signals for a completed run resolve to terminal waiting/completed messaging:
  - Orchestrator: `Execution complete; waiting on reviewer/tester`
  - Reviewer: `Review complete`
  - Tester: `Testing complete`

Verification command for this evidence:

- `npm test -w @orch-os/ui`

## Observed behavior

### 1) Core feature status transition works

- `draft -> executing` on start: **works**
- `executing -> cancelled` on cancel: **works**

### 2) Step status transition after cancel is inconsistent

After cancel, step statuses remained:

- step `0`: `active`
- step `1`: `pending`

Expected for office-scene clarity: steps should move to terminal/non-active states once feature is cancelled (for example `cancelled`/`blocked`/`pending` depending on product decision), so “Now/desk occupancy” does not imply continued execution.

### 3) Reviewer/tester role rendering is not represented

Activity included:

- `L2 reviewer launched for task [1] ...`
- `L2 tester launched for task [1] ...`

Current derivation logic in `feature-view-utils.ts` recognizes only:

- task agent launch (`L2 agent launched for task [...]`)
- merge auditor events

Result:

- reviewer/tester are not mapped as distinct figures/roles
- reviewer/tester agent IDs are not tracked in `agentIdToFigure`
- status label falls back to generic `"Walking to task"` for these events

This does not satisfy the shared-office requirement where personas/roles should be visually distinct.

### 4) Status regression: done -> walking on late launch event

For task 0, timeline included:

1. `L2 task [0] ... completed.` (terminal done)
2. later another `L2 agent launched for task [0] ...` event

Derived figure ended at:

- `state: "walking"`
- `statusLabel: "Starting task 0"`

So a late launch event can overwrite terminal completion and regress visual state.

## Recommended next fixes (priority order)

1. **Protect terminal task states from regression**
   - In `deriveAgentStageState`, once a task reaches terminal (`done` / failed terminal), ignore subsequent non-terminal launch/working updates unless an explicit retry/reopen event exists.

2. **Add explicit role parsing for reviewer/tester**
   - Extend launch parsing to handle:
     - `L2 reviewer launched for task [n] ...`
     - `L2 tester launched for task [n] ...`
   - Add role-aware figure modeling (`agent`, `reviewer`, `tester`, `auditor`) for office rendering.

3. **Track reviewer/tester IDs in mapping**
   - Include reviewer/tester cloud agent IDs in `agentIdToFigure` so links/hover/state tie to the correct persona.

4. **Make labels role-aware and human-readable**
   - Examples:
     - `Reviewer checking task 1`
     - `Tester validating task 1`
   - Avoid generic `"Walking to task"` for role-specific events.

5. **Align cancel semantics between feature and step states**
   - On feature cancel, reconcile step statuses so no step remains `active`.
   - Update UI copy/scene to reflect terminal cancellation cleanly.

6. **Add tests for these scenarios**
   - reviewer/tester launch parsing
   - terminal-state non-regression
   - cancel transition consistency between feature and steps
   - mixed event ordering (late/duplicate launch events)

