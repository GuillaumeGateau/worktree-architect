# @orch-os/ui

Vite + React dashboard. Expects API on the **same origin** (served by `@orch-os/api`).

```bash
npm run build
```

Development proxy (optional): `vite` dev server proxies `/api` → `127.0.0.1:45200` (see `vite.config.ts`).

## Office Scene Visualization PRD Contract (shared office agent experience)

This contract defines the product baseline for replacing the walking timeline with a shared-office scene.  
All follow-on UI tasks should align to this document unless explicitly superseded.

### 1) User goals

1. Understand **what is happening now** in a feature run without reading raw logs first.
2. See **which role is responsible** (orchestrator, worker, reviewer, tester) at each stage.
3. Track execution flow as movement between desk + execution zones while keeping context stable.
4. Keep trust via direct access to **full underlying activity logs** and source-of-truth statuses.
5. Quickly detect blocked, failed, or mismatched states and know where to investigate.

### 2) Success criteria

- A user can identify current owner + current phase within one screen scan.
- Every visible agent status maps to a deterministic source state/event (no ambiguous labels).
- Raw activity/execution logs remain available and are never replaced by visualization-only data.
- Blocked/failed states are visually distinct from active/waiting states.
- Visualization can represent concurrent work (multiple workers) without losing role clarity.

### 3) Role dictionary

| Role | Purpose in run | Primary zones | Typical entry trigger | Typical exit trigger | Human label examples |
| --- | --- | --- | --- | --- | --- |
| orchestrator | Plans flow, launches/coordinates work, tracks run progression | Orchestrator desk, dispatch zone | Feature enters `executing` or orchestration event starts | Work dispatched and role handoff completed | "Planning", "Dispatching", "Coordinating" |
| worker | Implements planned task steps | Worker desk, implementation zone | Task/step assigned or started | Task completed, blocked, or failed | "Implementing", "Working", "Waiting on review" |
| reviewer | Validates changes for quality/risk before merge completion | Reviewer desk, review zone | Work item marked ready for review | Review pass/fail recorded | "Reviewing", "Requesting changes", "Approved" |
| tester | Verifies behavior and regression safety | Tester desk, test zone | Review-approved work ready for validation | Test pass/fail recorded | "Testing", "Investigating failure", "Verified" |

Role invariants:

- The role badge/icon and role label must match the current role state.
- A role may be idle at desk while another role is active in a zone.
- If ownership is unknown, show explicit fallback state (for example: `Unassigned`) rather than inferring.

### 4) Visual state machine contract

Canonical visual states (for each role figure):

| State key | Meaning | Typical rendering intent |
| --- | --- | --- |
| `idle_at_desk` | Role exists but has no active assignment | Seated/idle at desk, muted status |
| `moving_to_zone` | Role is transitioning to a work zone | Walking/transition animation |
| `active_in_zone` | Role is actively executing role-specific work | Present in zone with active emphasis |
| `handoff_pending` | Role finished phase and is handing off | Transitional/awaiting-next-role cue |
| `blocked` | Work cannot proceed without intervention | High-contrast blocked style |
| `failed` | Terminal failure for current role phase | High-contrast failed style |
| `completed` | Role phase done successfully | Success style, ready to return |
| `returning_to_desk` | Post-work transition back to desk | Return animation |

Allowed transitions:

- `idle_at_desk -> moving_to_zone -> active_in_zone`
- `active_in_zone -> handoff_pending -> returning_to_desk -> idle_at_desk`
- `active_in_zone -> blocked`
- `active_in_zone -> failed`
- `blocked -> active_in_zone` (after unblock/retry)
- `blocked -> failed`
- `active_in_zone -> completed -> returning_to_desk -> idle_at_desk`

State machine constraints:

- No direct `idle_at_desk -> completed` transition.
- `failed` is terminal for that role phase unless a new run/phase instance starts.
- `blocked` is non-terminal and must indicate unresolved dependency.
- Display labels should remain human-readable, but state keys above are canonical for logic/tests.

### 5) Clarity and observability guardrails

- Visualization is a projection, not the source of truth; backend status/event data remains authoritative.
- Every user-facing status should be traceable to an activity/log event or explicit computed rule.
- Keep a visible path to raw logs/activity in the same feature view.
- Do not hide orchestration complexity; summarize it with clear labels and preserve drill-down details.
