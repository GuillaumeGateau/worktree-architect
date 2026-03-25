# Install Orchestration OS Cursor assets globally

This is **separate from npm packages** (`@orch-os/cli`, etc.). Cursor loads **rules** (`.mdc`), **skills** (`SKILL.md` folders), and **slash commands** (`.md`) from:

- **Global:** `~/.cursor/rules/`, `~/.cursor/skills/`, `~/.cursor/commands/`
- **Project-only:** `.cursor/…` inside a single repo

The files under [`install/`](../install/) in this repository are **project-agnostic**: tri-tier workflow, orchestrator bootstrap, auditors, execute-without-terminal, integration rules, and `/orchestrate-bootstrap`. Installing them globally makes them available in **every** Cursor workspace.

## One-command install (recommended)

From the **repository root** (after clone):

```bash
chmod +x scripts/install-cursor-global.sh
./scripts/install-cursor-global.sh
```

Or via npm:

```bash
npm run install:cursor-global
```

Optional: install to a non-default Cursor config root:

```bash
CURSOR_HOME="$HOME/.cursor" ./scripts/install-cursor-global.sh
```

## Ask Cursor to install for you

Point the agent at this file and say something like:

> Follow [docs/CURSOR_GLOBAL_INSTALL.md](CURSOR_GLOBAL_INSTALL.md) and run the install script from the repo root (request permissions if the sandbox blocks writing to `~/.cursor`).

The agent should run `bash scripts/install-cursor-global.sh` (or `npm run install:cursor-global`) with access to your home directory.

## What gets installed

| Source | Destination | Contents |
|--------|-------------|----------|
| `install/rules/*.mdc` | `~/.cursor/rules/` | Manifesto, orchestrator integration, cleansing standards |
| `install/skills/*/` | `~/.cursor/skills/<name>/` | Bootstrap, L1/L2, auditors, execute-without-terminal, … |
| `install/commands/*.md` | `~/.cursor/commands/` | e.g. `/orchestrate-bootstrap` |

The script is **idempotent**: re-running overwrites only the files shipped here. It does **not** delete other skills or rules you added manually under different names.

## After installing

1. **Restart Cursor** (or reload the window) if new rules or slash commands do not appear.
2. Type **`/`** in chat and confirm **`orchestrate-bootstrap`** (and other commands) are listed.
3. Skills are picked up by description; you can also say **“use the orchestrator-bootstrap skill”** explicitly.

## Windows

Use **Git Bash**, **WSL**, or another environment where `bash` and this script can write to your Cursor config directory (often `%USERPROFILE%\.cursor` — set `CURSOR_HOME` accordingly in Git Bash: `export CURSOR_HOME="$USERPROFILE/.cursor"`).

## Validate skill metadata (contributors)

From repo root:

```bash
npm run validate:cursor
```

## See also

- [install/README.md](../install/README.md) — short pointer to this doc
- [docs/NEW_PROJECT.md](NEW_PROJECT.md) — wiring **orchestrator** into an app repo (npm + config), not the same as this global Cursor install
