# orchestrator-plugins

Python sidecar for Orchestration OS: validate job envelopes and run example gates (pytest/ruff wrappers).

See repo root [docs/NEW_PROJECT.md](../../docs/NEW_PROJECT.md).

## Install (local / editable)

```bash
cd python/orchestrator_plugins
pip install -e ".[dev]"
```

## CLI

```bash
orch-plugin validate --job-file job.json
```

Uses the JSON Schema emitted by `@orch-os/core` at `packages/core/dist/job-envelope.schema.json` when that path exists relative to the monorepo.
