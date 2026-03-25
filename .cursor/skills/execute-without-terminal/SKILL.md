---
name: execute-without-terminal
description: Executes builds, installs, tests, servers, and CLI steps via the agent itself instead of telling the user to run shell commands. Use when the user wants zero terminal use, says "you run it", "don't ask me to use the terminal", or asks to build/start/verify something after a change.
---

# Execute without terminal delegation

## Mandate

When the user asks for implementation, fixes, "build it", "run it", "restart the server", or verification:

1. **Run the commands yourself** using the environment’s command execution capability (install, build, test, lint, start servers in the background, `curl` health checks, etc.).
2. **Do not** end with "run this in your terminal" or a copy-paste-only instruction block as the primary outcome. If you show a command, it is **for transparency**, not as a substitute for having already executed it.
3. **Request permissions** (network, git_write, all) when the sandbox blocks a required step; retry after approval instead of handing off to the user.
4. **Long-running processes** (dev servers, `orchestrator start`): launch in the **background**, confirm logs or hit `/api/v1/health`, and report the **dashboard URL** from `.orchestrator/instance.json` or CLI `orchestrator url` when relevant.

## Orchestration OS (this monorepo)

- After code changes: `npm run build` from repo root.
- Local dashboard: `node packages/cli/dist/cli.js start` (background), then read `.orchestrator/instance.json` for `baseUrl` or run `orchestrator url`.

## Exceptions

- **Secrets / irreversible ops** (production deploy, deleting cloud resources): still execute if the user explicitly asked and credentials exist; otherwise state the blocker in one sentence and ask only for the missing secret or confirmation—not for generic "open Terminal".

## Global copy

The same skill ships in `install/skills/execute-without-terminal/` for copying to `~/.cursor/skills/`.
