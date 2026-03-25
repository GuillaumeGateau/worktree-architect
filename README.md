# Orchestration OS (v2)

Lightweight **local** orchestration: **SQLite** + **one Node process** serving **JSON API**, **SSE**, and a **React dashboard**. **No Postgres** and **no Docker** on the happy path. Optional **Redis** Compose profile for future scale-out.

## Quickstart (this monorepo)

**Hands-off Feature Start:** with **`.env`** **`CURSOR_API_KEY`** and a **GitHub** `git remote origin`, **Start** launches a **Cursor Cloud Agent** automatically (implements the plan, including `test-apps/…` when set). Set **`autoCursorCloudAgentOnStart: false`** in `orchestrator.config.yaml` to disable. See [docs/FEATURE_EXECUTION.md](docs/FEATURE_EXECUTION.md).

```bash
npm install
npm run build
npm run orchestrator -- init
npm run orchestrator -- start
```

Open the printed **http://127.0.0.1:…** URL. In another terminal:

```bash
npm run orchestrator -- url
npm run orchestrator -- job enqueue examples/job-example.yaml --emit-pr-body-snippet
```

## Packages

| Package | Description |
|---------|-------------|
| [`@orch-os/core`](packages/core/README.md) | Types + JSON Schema |
| [`@orch-os/api`](packages/api/README.md) | HTTP + SQLite + SSE |
| [`@orch-os/ui`](packages/ui/README.md) | Dashboard |
| [`@orch-os/cli`](packages/cli/README.md) | CLI binary `orchestrator` |
| [`python/orchestrator_plugins`](python/orchestrator_plugins/README.md) | Python plugins |

## Cursor (slash commands)

**`~` means your home directory** (shell: `echo $HOME`). Cursor does **not** read `~/` from the repo; global assets must **physically exist** under `$HOME/.cursor/`.

| Where | Path on disk | Who sees `/build-feature` |
|--------|----------------|-----------------------------|
| **Project** (committed in this repo) | `<repo>/.cursor/commands/*.md` | Anyone who opens **this** repository |
| **Global** (one-time install) | **`~/.cursor/commands/*.md`** | **Every** workspace on your machine |

- **This repo** includes `.cursor/commands/build-feature.md`, `build-feature-test-app.md`, and matching skills so slash commands work **without** running the installer.
- **Other repos** only get the same commands if you run **`npm run install:cursor-global`** once from orch-os (copies `install/commands` → **`~/.cursor/commands`**) or you add their own `.cursor/` files.

**Product vs disposable demos (this monorepo):** use **`/build-feature`** to change **`packages/`**, **`install/`**, etc. Use **`/build-feature-test-app`** or **`/build-feature test-app …`** so the agent keeps files under **`test-apps/<slug>/`** (gitignored). See **orch-build-feature** skill.

- **Docs:** [docs/CURSOR_GLOBAL_INSTALL.md](docs/CURSOR_GLOBAL_INSTALL.md)
- **Installer:** `npm run install:cursor-global`

`npm install` does **not** populate `~/.cursor/`; only the install script or committed `.cursor/` does.

### Dashboard: `GET /api/v1/features` → 404

The UI is newer than the **running** API process. **Rebuild and restart** from the repo root:

```bash
npm run build
npm run orchestrator -- start
```

(`start` stops the previous instance when its PID is still recorded.) Confirm with `npm run orchestrator -- doctor`.

## Docs

- [docs/NEW_PROJECT.md](docs/NEW_PROJECT.md) — adopt in a new repo  
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — ports, instance file, Redis note  
- [docs/FEATURE_EXECUTION.md](docs/FEATURE_EXECUTION.md) — what **Start** does / does **not** do (no auto subagents)  
- [docs/TESTING.md](docs/TESTING.md) — open the UI, disposable Hangman test app under `test-apps/` (gitignored)  

## License

MIT (add a LICENSE file if you publish publicly).
