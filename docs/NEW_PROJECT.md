# New project checklist

## 1. Install global Cursor assets (once per machine)

From the `orch-os` repository, use the installer (recommended — see **[CURSOR_GLOBAL_INSTALL.md](CURSOR_GLOBAL_INSTALL.md)**):

```bash
npm run install:cursor-global
```

Or: `./scripts/install-cursor-global.sh`

## 2. Add Orchestration OS to a repository

**Minimal (no Docker):**

1. Add dependency **`@orch-os/cli`** (when published) or use **`npm link`** / workspace path from this monorepo during development.
2. Run **`orchestrator init`** in the target repo (or let the `/orchestrate-bootstrap` command + skill generate files).
3. Ensure `.gitignore` ignores:
   - `.orchestrator/instance.json`
   - `.orchestrator/*.db`, `*.db-wal`, `*.db-shm`
4. Add a script to **`package.json`**:

```json
{
  "scripts": {
    "orchestrator:start": "orchestrator start"
  }
}
```

5. Start the stack:

```bash
npm run orchestrator:start
```

6. Open the printed URL (dashboard). Agents resolve the same URL via **`orchestrator url`** or `.orchestrator/instance.json`.

**What to commit**

- `orchestrator.config.yaml` — yes.
- `.orchestrator/STATUS.md` — optional team policy (can be noisy if auto-updated).
- **Do not** commit `instance.json`, SQLite files, or log dumps.

## 3. Optional Redis scale profile

Only if you need multi-consumer fan-out:

```bash
docker compose --profile scale up -d
```

Set `REDIS_URL` only when the API implements the Redis adapter for your deployment; the stock build logs a notice and remains SQLite-authoritative.

## 4. Python validators (optional)

```bash
cd python/orchestrator_plugins
pip install -e ".[dev]"
orch-plugin validate --job-file ../../examples/job-example.yaml
```

Point `--job-file` at a JSON job exported from the API when testing schema alignment.

## 5. Slash command / skill

In Cursor, run **`/orchestrate-bootstrap`** to have the agent apply the checklist above with stack detection.
