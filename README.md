# Orchestration OS (v2)

Lightweight **local** orchestration: **SQLite** + **one Node process** serving **JSON API**, **SSE**, and a **React dashboard**. **No Postgres** and **no Docker** on the happy path. Optional **Redis** Compose profile for future scale-out.

## Quickstart (this monorepo)

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

## Cursor (global)

Install **rules, skills, and slash commands** into `~/.cursor/` so they apply in **all** projects:

- **Docs:** [docs/CURSOR_GLOBAL_INSTALL.md](docs/CURSOR_GLOBAL_INSTALL.md)
- **One command:** `npm run install:cursor-global` (or `./scripts/install-cursor-global.sh`)

Then use **`/orchestrate-bootstrap`** and other commands in any workspace. This is separate from the **`@orch-os/*`** npm packages.

## Docs

- [docs/NEW_PROJECT.md](docs/NEW_PROJECT.md) — adopt in a new repo  
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — ports, instance file, Redis note  
- [docs/TESTING.md](docs/TESTING.md) — open the UI, disposable Hangman test app under `test-apps/` (gitignored)  

## License

MIT (add a LICENSE file if you publish publicly).
