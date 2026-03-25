# How to test Orchestration OS

## What people usually mean by “that note”

If something in the docs felt vague, it was often one of these:

1. **Publishing** — `@orch-os/*` is not necessarily on npm yet; in this monorepo you run the CLI via `npm run orchestrator` after `npm run build`.
2. **`.orchestrator/instance.json`** — Created when the server starts; **gitignored** so each machine has its own URL/port. Agents use `orchestrator url` to discover it.
3. **Empty vs busy UI** — With **zero jobs**, the dashboard shows “No jobs yet.” After you **enqueue** a job, the table fills in and SSE marks “connected.”

## See the dashboard (frontend)

1. From the repo root:

```bash
npm install
npm run build
npm run orchestrator -- start
```

2. The terminal prints a URL like **`http://127.0.0.1:452xx/`**. Open it in a browser.
3. Confirm you see **Orchestration OS** with **SSE connected** and an **empty jobs table** (waiting state).

### After a job is enqueued (stuck on “queued”?)

Nothing auto-runs yet: **you** (or a worker script / agent) must move the job through the state machine.

**In the dashboard:** use the row **Actions** column — typical flow is **Claim** → **Start** → **Done** (or **Fail** / **Block**).

**From the terminal:**

```bash
JOB_ID=your_id_here
npm run orchestrator -- job patch "$JOB_ID" --status claimed --worker-id me
npm run orchestrator -- job patch "$JOB_ID" --status running
npm run orchestrator -- job patch "$JOB_ID" --status succeeded
```

Invalid transitions return **400** from the API.

To print the URL again (e.g. for agents):

```bash
npm run orchestrator -- url
```

## Disposable “Hangman” test app (not tracked in git)

Generated files live under **`test-apps/`**, which is **gitignored** so the main repo stays clean. Delete that folder anytime.

```bash
npm run test:scaffold-hangman
```

Then **with the server still running**, enqueue a job that points at that folder:

```bash
npm run orchestrator -- job enqueue test-apps/hangman-demo/orchestrator-job.yaml --emit-pr-body-snippet
```

Refresh the dashboard: you should see a new **queued** job with role `hangman-demo` and the branch/path in the table.

Open the demo itself:

```bash
open test-apps/hangman-demo/index.html
# or double-click index.html in your file manager
```

## Clean up

```bash
rm -rf test-apps
# optional: remove local DB + instance (stops needing to match old pid)
rm -rf .orchestrator/*.db .orchestrator/instance.json 2>/dev/null
```

## What this does *not* test (yet)

The orchestrator **tracks jobs**; it does **not** auto-spawn Cursor agents to implement “create hangman.” A full E2E would be: enqueue → external worker/agent → PATCH job to `running`/`succeeded`. The scaffold + enqueue flow validates **UI + API + SQLite + SSE**.
